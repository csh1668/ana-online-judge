import { and, asc, count, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	algorithmTags,
	contestOperators,
	contestParticipants,
	contestProblems,
	contests,
	type ExternalSite,
	type LanguageCode,
	type ProblemType,
	problemAuthors,
	problemConfirmedTags,
	problemReviewers,
	problemSources,
	problems,
	sources,
	submissions,
	type Translations,
	testcases,
	userExternalHandles,
	users,
} from "@/db/schema";
import { col, tbl } from "@/lib/db-helpers";
import { JUDGE_PRIORITY_LEVELS, type JudgePriority } from "@/lib/judge-priority";
import { userFavoritedProblemFilterSql } from "@/lib/services/problem-favorites";
import { PROBLEM_TABLE_SORT_KEYS, type SortOrder } from "@/lib/services/problem-list-sort";
import { parseProblemSearchQuery } from "@/lib/services/problem-search-query";
import {
	ANIGMA_SOLVED_THRESHOLD,
	makeAcceptRateStatsSubquery,
	makeCanonicalSolverStatsSubquery,
	userSolvedProblemFilterSql,
} from "@/lib/services/solved-clause";
import { getAncestorChain, getDescendantIds } from "@/lib/sources/tree-queries";
import { deleteAllProblemFiles, uploadFile } from "@/lib/storage";
import { nowIso, resolveDisplay } from "@/lib/utils/translations";
import { translationsSchema } from "@/lib/validation/translations";

type AdminProblemsSort = "id" | "createdAt" | "submissionCount";

export async function getAdminProblems(options?: {
	page?: number;
	limit?: number;
	search?: string;
	isPublic?: boolean;
	judgeAvailable?: boolean;
	problemType?: ProblemType;
	sort?: AdminProblemsSort;
	order?: "asc" | "desc";
}) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const sort = options?.sort ?? "createdAt";
	const order = options?.order ?? "desc";

	const conditions: SQL[] = [];
	if (options?.search) {
		const trimmed = options.search.trim();
		const numeric = Number.parseInt(trimmed, 10);
		const titleMatch = sql`${problems.displayTitle} ILIKE ${`%${trimmed}%`}`;
		conditions.push(
			Number.isFinite(numeric) ? sql`(${problems.id} = ${numeric} OR ${titleMatch})` : titleMatch
		);
	}
	if (options?.isPublic !== undefined) conditions.push(eq(problems.isPublic, options.isPublic));
	if (options?.judgeAvailable !== undefined)
		conditions.push(eq(problems.judgeAvailable, options.judgeAvailable));
	if (options?.problemType) conditions.push(eq(problems.problemType, options.problemType));

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	// 외부 ${problems.id} 참조는 col()로 감싸야 prefix-stripping을 막을 수 있다.
	const testcaseCountSql = sql<number>`(
		SELECT COUNT(*)::int FROM testcases
		WHERE testcases.problem_id = ${col(problems, problems.id)}
	)`;
	const submissionCountSql = sql<number>`(
		SELECT COUNT(*)::int FROM submissions
		WHERE submissions.problem_id = ${col(problems, problems.id)}
	)`;
	const acceptedUserCountSql = sql<number>`(
		SELECT COUNT(DISTINCT user_id)::int FROM submissions
		WHERE submissions.problem_id = ${col(problems, problems.id)} AND submissions.verdict = 'accepted'
	)`;

	let orderBy: SQL;
	switch (sort) {
		case "id":
			orderBy = order === "asc" ? asc(problems.id) : desc(problems.id);
			break;
		case "submissionCount":
			orderBy = order === "asc" ? sql`submission_count ASC` : sql`submission_count DESC`;
			break;
		default:
			orderBy = order === "asc" ? asc(problems.createdAt) : desc(problems.createdAt);
			break;
	}

	const [problemsList, totalResult] = await Promise.all([
		db
			.select({
				id: problems.id,
				title: problems.displayTitle,
				isPublic: problems.isPublic,
				judgeAvailable: problems.judgeAvailable,
				problemType: problems.problemType,
				createdAt: problems.createdAt,
				testcaseCount: testcaseCountSql.as("testcase_count"),
				submissionCount: submissionCountSql.as("submission_count"),
				acceptedUserCount: acceptedUserCountSql.as("accepted_user_count"),
			})
			.from(problems)
			.where(whereClause)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(problems).where(whereClause),
	]);

	return {
		problems: problemsList,
		total: totalResult[0].count,
	};
}

function validateJudgePriority(value: number): asserts value is JudgePriority {
	if (!(JUDGE_PRIORITY_LEVELS as readonly number[]).includes(value)) {
		throw new Error(
			`채점 우선순위는 ${JUDGE_PRIORITY_LEVELS.join(", ")} 중 하나여야 합니다. (입력값: ${value})`
		);
	}
}

async function validateFullJudgeInputs(opts: {
	problemId?: number;
	useFullJudge: boolean;
	passThreshold: number | null;
	problemType: ProblemType;
	hasSubtasks: boolean;
}) {
	if (!opts.useFullJudge) return;

	if (opts.hasSubtasks) {
		throw new Error("서브테스크와 전체 채점은 동시에 사용할 수 없습니다.");
	}
	if (opts.problemType === "anigma") {
		throw new Error("Anigma 문제는 전체 채점을 사용할 수 없습니다.");
	}
	if (opts.passThreshold !== null && opts.passThreshold < 1) {
		throw new Error("통과 기준(M)은 1 이상이어야 합니다.");
	}

	if (opts.problemId === undefined) {
		// 신규 생성: TC=0 implied, passThreshold 설정 불가
		if (opts.passThreshold !== null) {
			throw new Error(
				"문제 생성 시점에는 통과 기준을 설정할 수 없습니다. 테스트케이스 업로드 후 설정해주세요."
			);
		}
		return;
	}

	const [{ count: tcCount }] = await db
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(testcases)
		.where(eq(testcases.problemId, opts.problemId));

	if (tcCount === 0) {
		if (opts.passThreshold !== null) {
			throw new Error("테스트케이스가 없으면 통과 기준을 설정할 수 없습니다.");
		}
		return;
	}
	// tcCount > 0
	if (opts.passThreshold === null) {
		throw new Error("테스트케이스가 존재하면 통과 기준(M)을 지정해야 합니다.");
	}
	if (opts.passThreshold > tcCount) {
		throw new Error(`통과 기준(${opts.passThreshold})이 테스트케이스 수(${tcCount})보다 큽니다.`);
	}
}

export async function createProblem(data: {
	id?: number;
	translations: Translations;
	timeLimit: number;
	memoryLimit: number;
	maxScore: number;
	isPublic: boolean;
	judgeAvailable?: boolean;
	problemType?: ProblemType;
	useFullJudge?: boolean;
	passThreshold?: number | null;
	showCheckerOutput: boolean;
	judgePriority?: number;
	allowedLanguages?: string[] | null;
	referenceCodeBuffer?: Buffer | null;
	solutionCodeBuffer?: Buffer | null;
}) {
	const validatedTranslations = translationsSchema.parse(data.translations);

	if (data.judgePriority !== undefined) {
		validateJudgePriority(data.judgePriority);
	}

	await validateFullJudgeInputs({
		useFullJudge: data.useFullJudge ?? false,
		passThreshold: data.passThreshold ?? null,
		problemType: data.problemType ?? "icpc",
		hasSubtasks: false,
	});

	if (data.id !== undefined) {
		const existing = await db.select().from(problems).where(eq(problems.id, data.id)).limit(1);
		if (existing.length > 0) {
			throw new Error(`문제 ID ${data.id}는 이미 사용 중입니다.`);
		}
	}

	const tempId = data.id || Date.now();

	let referenceCodePath: string | null = null;
	if (data.problemType === "anigma" && data.referenceCodeBuffer) {
		referenceCodePath = `problems/${tempId}/reference_code.zip`;
		await uploadFile(referenceCodePath, data.referenceCodeBuffer, "application/zip");
	}

	let solutionCodePath: string | null = null;
	if (data.problemType === "anigma" && data.solutionCodeBuffer) {
		solutionCodePath = `problems/${tempId}/solution_code.zip`;
		await uploadFile(solutionCodePath, data.solutionCodeBuffer, "application/zip");
	}

	const [newProblem] = await db
		.insert(problems)
		.values({
			...(data.id !== undefined && { id: data.id }),
			translations: validatedTranslations as Translations,
			timeLimit: data.timeLimit,
			memoryLimit: data.memoryLimit,
			maxScore: data.maxScore,
			isPublic: data.isPublic,
			judgeAvailable: data.judgeAvailable ?? false,
			problemType: data.problemType ?? "icpc",
			useFullJudge: data.useFullJudge ?? false,
			passThreshold: data.passThreshold ?? null,
			showCheckerOutput: data.showCheckerOutput,
			judgePriority: data.judgePriority ?? 0,
			allowedLanguages: data.allowedLanguages ?? null,
			referenceCodePath: referenceCodePath,
			solutionCodePath: solutionCodePath,
		})
		.returning();

	if (data.id !== undefined) {
		await db.execute(
			sql`SELECT setval(pg_get_serial_sequence('problems', 'id'), GREATEST(${data.id}, (SELECT COALESCE(MAX(id), 0) FROM problems)))`
		);
	}

	return newProblem;
}

export async function updateProblem(
	id: number,
	data: {
		timeLimit?: number;
		memoryLimit?: number;
		maxScore?: number;
		isPublic?: boolean;
		judgeAvailable?: boolean;
		problemType?: ProblemType;
		useFullJudge?: boolean;
		passThreshold?: number | null;
		showCheckerOutput?: boolean;
		checkerPath?: string | null;
		validatorPath?: string | null;
		judgePriority?: number;
		allowedLanguages?: string[] | null;
		referenceCodeBuffer?: Buffer | null;
		solutionCodeBuffer?: Buffer | null;
	}
) {
	if (data.judgePriority !== undefined) {
		validateJudgePriority(data.judgePriority);
	}

	const [existing] = await db
		.select({
			useFullJudge: problems.useFullJudge,
			passThreshold: problems.passThreshold,
			problemType: problems.problemType,
			hasSubtasks: problems.hasSubtasks,
		})
		.from(problems)
		.where(eq(problems.id, id))
		.limit(1);
	if (!existing) throw new Error("문제를 찾을 수 없습니다.");

	const nextUseFullJudge = data.useFullJudge ?? existing.useFullJudge;
	const nextPassThreshold =
		data.passThreshold !== undefined ? data.passThreshold : existing.passThreshold;
	const nextProblemType = data.problemType ?? existing.problemType;

	await validateFullJudgeInputs({
		problemId: id,
		useFullJudge: nextUseFullJudge,
		passThreshold: nextPassThreshold,
		problemType: nextProblemType,
		hasSubtasks: existing.hasSubtasks,
	});

	let referenceCodePath: string | undefined;
	if (data.problemType === "anigma" && data.referenceCodeBuffer) {
		referenceCodePath = `problems/${id}/reference_code.zip`;
		await uploadFile(referenceCodePath, data.referenceCodeBuffer, "application/zip");
	}

	let solutionCodePath: string | undefined;
	if (data.problemType === "anigma" && data.solutionCodeBuffer) {
		solutionCodePath = `problems/${id}/solution_code.zip`;
		await uploadFile(solutionCodePath, data.solutionCodeBuffer, "application/zip");
	}

	interface UpdateData {
		timeLimit?: number;
		memoryLimit?: number;
		maxScore?: number;
		isPublic?: boolean;
		judgeAvailable?: boolean;
		problemType?: ProblemType;
		useFullJudge?: boolean;
		passThreshold?: number | null;
		showCheckerOutput?: boolean;
		checkerPath?: string | null;
		validatorPath?: string | null;
		judgePriority?: number;
		allowedLanguages?: string[] | null;
		referenceCodePath?: string | null;
		solutionCodePath?: string | null;
		updatedAt: Date;
	}

	const { referenceCodeBuffer: _rc, solutionCodeBuffer: _sc, ...dbFields } = data;
	const updateData: UpdateData = { ...dbFields, updatedAt: new Date() };
	if (referenceCodePath !== undefined) {
		updateData.referenceCodePath = referenceCodePath;
	}
	if (solutionCodePath !== undefined) {
		updateData.solutionCodePath = solutionCodePath;
	}

	const [updatedProblem] = await db
		.update(problems)
		.set(updateData)
		.where(eq(problems.id, id))
		.returning();

	return updatedProblem;
}

export async function deleteProblem(id: number) {
	try {
		const deletedCount = await deleteAllProblemFiles(id);
		console.log(`Deleted ${deletedCount} files for problem ${id} from MinIO`);
	} catch (error) {
		console.error(`Failed to delete MinIO files for problem ${id}:`, error);
	}

	await db.delete(problems).where(eq(problems.id, id));

	return { success: true };
}

export const GET_PROBLEMS_SORT_KEYS = [
	...PROBLEM_TABLE_SORT_KEYS,
	"createdAt",
	"tier",
	"random",
] as const;
export type GetProblemsSort = (typeof GET_PROBLEMS_SORT_KEYS)[number];

export async function getProblems(
	options:
		| {
				page?: number;
				limit?: number;
				publicOnly?: boolean;
				search?: string;
				sort?: GetProblemsSort;
				order?: SortOrder;
				filter?: "all" | "unsolved" | "solved" | "wrong" | "new" | "favorite";
				userId?: number;
				includeUnavailable?: boolean;
				sourceId?: number;
				sourceIdMode?: "descendants" | "direct";
				ids?: number[];
		  }
		| undefined,
	context: { isAdmin: boolean }
) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const filter = options?.filter ?? "all";
	const sort = filter === "new" ? "createdAt" : (options?.sort ?? "id");
	const order = filter === "new" ? "desc" : (options?.order ?? "asc");

	// Admin can see all problems, others only see public problems
	const publicOnly = context.isAdmin ? false : (options?.publicOnly ?? true);

	const conditions: SQL[] = [];
	if (publicOnly) {
		conditions.push(eq(problems.isPublic, true));
	}
	if (!options?.includeUnavailable) {
		conditions.push(eq(problems.judgeAvailable, true));
	}
	if (options?.search) {
		const tokens = parseProblemSearchQuery(options.search);
		const problemTypeValues: ProblemType[] = [];
		const sourceSlugs: string[] = [];
		for (const token of tokens) {
			switch (token.type) {
				case "id":
					conditions.push(eq(problems.id, token.value));
					break;
				case "tier": {
					if (token.values.length === 1) {
						conditions.push(eq(problems.tier, token.values[0]));
					} else if (token.values.length > 1) {
						conditions.push(inArray(problems.tier, token.values));
					}
					break;
				}
				case "problemType":
					problemTypeValues.push(token.value);
					break;
				case "source":
					sourceSlugs.push(token.value);
					break;
				case "tag": {
					const pattern = `%${token.value}%`;
					conditions.push(sql`EXISTS (
						SELECT 1 FROM ${tbl(problemConfirmedTags)} pct
						INNER JOIN ${tbl(algorithmTags)} atag ON atag.id = pct.tag_id
						WHERE pct.problem_id = ${problems.id}
						  AND (
							atag.name ILIKE ${pattern}
							OR atag.slug ILIKE ${pattern}
							OR atag.description ILIKE ${pattern}
						  )
					)`);
					break;
				}
				case "solver": {
					conditions.push(sql`EXISTS (
						SELECT 1 FROM ${tbl(users)} u_solver
						WHERE u_solver.username = ${token.value}
						  AND (
							(${problems.problemType} != 'anigma' AND EXISTS (
								SELECT 1 FROM ${tbl(submissions)} s_solver
								WHERE s_solver.problem_id = ${problems.id}
								  AND s_solver.user_id = u_solver.id
								  AND s_solver.score = ${problems.maxScore}
							))
							OR
							(${problems.problemType} = 'anigma' AND (
								SELECT COALESCE(MAX(CASE WHEN s_solver.anigma_task_type = 1 THEN s_solver.score END), 0)
								     + COALESCE(MAX(CASE WHEN s_solver.anigma_task_type = 2 THEN s_solver.score END), 0)
								FROM ${tbl(submissions)} s_solver
								WHERE s_solver.problem_id = ${problems.id} AND s_solver.user_id = u_solver.id
							) >= ${ANIGMA_SOLVED_THRESHOLD})
						  )
					)`);
					break;
				}
				default: {
					const pattern = `%${token.value}%`;
					conditions.push(sql`(
						${problems.displayTitle} ILIKE ${pattern}
						OR EXISTS (
							SELECT 1 FROM jsonb_each(${problems.translations}->'entries') AS entry(lang, val)
							WHERE val->>'title' ILIKE ${pattern} OR val->>'content' ILIKE ${pattern}
						)
					)`);
					break;
				}
			}
		}
		if (problemTypeValues.length === 1) {
			conditions.push(eq(problems.problemType, problemTypeValues[0]));
		} else if (problemTypeValues.length > 1) {
			conditions.push(inArray(problems.problemType, problemTypeValues));
		}
		// 각 source 토큰은 AND 결합. 동일 slug 가 여러 노드에 존재할 수 있으므로 매칭된
		// 모든 source 의 후손 ID 집합을 모아 problem_sources 와 EXISTS 조인한다.
		for (const slug of sourceSlugs) {
			const matched = await db
				.select({ id: sources.id })
				.from(sources)
				.where(eq(sources.slug, slug));
			if (matched.length === 0) {
				conditions.push(sql`FALSE`);
				continue;
			}
			const idSets = await Promise.all(matched.map((m) => getDescendantIds(m.id)));
			const allIds = Array.from(new Set(idSets.flat()));
			if (allIds.length === 0) {
				conditions.push(sql`FALSE`);
				continue;
			}
			const matchedProblemIds = db
				.select({ id: problemSources.problemId })
				.from(problemSources)
				.where(inArray(problemSources.sourceId, allIds));
			conditions.push(inArray(problems.id, matchedProblemIds));
		}
	}
	if (options?.ids !== undefined) {
		if (options.ids.length === 0) {
			conditions.push(sql`FALSE`);
		} else {
			conditions.push(inArray(problems.id, options.ids));
		}
	}
	if (options?.sourceId !== undefined) {
		const ids =
			options.sourceIdMode === "direct"
				? [options.sourceId]
				: await getDescendantIds(options.sourceId);
		if (ids.length === 0) {
			conditions.push(sql`FALSE`);
		} else {
			const matchedProblemIds = db
				.select({ id: problemSources.problemId })
				.from(problemSources)
				.where(inArray(problemSources.sourceId, ids));
			conditions.push(inArray(problems.id, matchedProblemIds));
		}
	}

	// 정답률 stats subquery: "최초 AC까지의 제출만" 분모에 카운트 (makeAcceptRateStatsSubquery 참고).
	// solverCount는 canonical solved 정의(Anigma Task1+Task2≥70 / 일반 score=max_score)를
	// 사용해야 하므로 별도의 makeCanonicalSolverStatsSubquery로 분리.
	const statsSq = makeAcceptRateStatsSubquery();

	const solverStatsSq = makeCanonicalSolverStatsSubquery();

	// User status filter subqueries (canonical "solved" 정의 사용)
	if (options?.userId && filter !== "all" && filter !== "new") {
		const userId = options.userId;
		if (filter === "solved") {
			conditions.push(userSolvedProblemFilterSql(userId));
		} else if (filter === "wrong") {
			conditions.push(
				sql`EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId})`
			);
			conditions.push(sql`NOT ${userSolvedProblemFilterSql(userId)}`);
		} else if (filter === "unsolved") {
			conditions.push(sql`NOT ${userSolvedProblemFilterSql(userId)}`);
		} else if (filter === "favorite") {
			conditions.push(userFavoritedProblemFilterSql(userId));
		}
	}

	const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

	let orderBy: SQL;
	switch (sort) {
		case "title":
			orderBy = order === "asc" ? asc(problems.displayTitle) : desc(problems.displayTitle);
			break;
		case "createdAt":
			orderBy = order === "asc" ? asc(problems.createdAt) : desc(problems.createdAt);
			break;
		case "acceptRate":
			orderBy =
				order === "asc"
					? sql`COALESCE(${statsSq.solvedUsers}::float / NULLIF(${statsSq.effectiveSubmissions}, 0), 0) ASC`
					: sql`COALESCE(${statsSq.solvedUsers}::float / NULLIF(${statsSq.effectiveSubmissions}, 0), 0) DESC`;
			break;
		case "submissionCount":
			orderBy =
				order === "asc"
					? sql`COALESCE(${statsSq.totalSubmissions}, 0) ASC`
					: sql`COALESCE(${statsSq.totalSubmissions}, 0) DESC`;
			break;
		case "solverCount":
			orderBy =
				order === "asc"
					? sql`COALESCE(${solverStatsSq.solverCount}, 0) ASC`
					: sql`COALESCE(${solverStatsSq.solverCount}, 0) DESC`;
			break;
		case "tier":
			orderBy = order === "asc" ? asc(problems.tier) : desc(problems.tier);
			break;
		case "random":
			orderBy = sql`RANDOM()`;
			break;
		default:
			orderBy = order === "asc" ? asc(problems.id) : desc(problems.id);
			break;
	}

	const problemsQuery = db
		.select({
			id: problems.id,
			title: problems.displayTitle,
			isPublic: problems.isPublic,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			problemType: problems.problemType,
			judgeAvailable: problems.judgeAvailable,
			languageRestricted: sql<boolean>`${problems.allowedLanguages} IS NOT NULL`,
			hasSubtasks: problems.hasSubtasks,
			useFullJudge: problems.useFullJudge,
			tier: problems.tier,
			authorNames: sql<
				string[]
			>`COALESCE((SELECT array_agg(COALESCE(${col(users, users.name)}, ${col(problemAuthors, problemAuthors.externalName)})) FROM ${tbl(problemAuthors)} LEFT JOIN ${tbl(users)} ON ${col(users, users.id)} = ${col(problemAuthors, problemAuthors.userId)} WHERE ${col(problemAuthors, problemAuthors.problemId)} = ${col(problems, problems.id)}), ARRAY[]::text[])`,
			createdAt: problems.createdAt,
			submissionCount: sql<number>`COALESCE(${statsSq.totalSubmissions}, 0)`,
			effectiveSubmissions: sql<number>`COALESCE(${statsSq.effectiveSubmissions}, 0)`,
			solvedUsers: sql<number>`COALESCE(${statsSq.solvedUsers}, 0)`,
			solverCount: sql<number>`COALESCE(${solverStatsSq.solverCount}, 0)`,
		})
		.from(problems)
		.leftJoin(statsSq, eq(problems.id, statsSq.problemId))
		.leftJoin(solverStatsSq, eq(problems.id, solverStatsSq.problemId))
		.where(whereCondition)
		.orderBy(orderBy)
		.limit(limit)
		.offset(offset);

	const countQuery = db.select({ count: count() }).from(problems).where(whereCondition);

	const [problemsList, totalResult] = await Promise.all([problemsQuery, countQuery]);

	return {
		problems: problemsList,
		total: totalResult[0].count,
	};
}

export async function getProblemById(
	id: number,
	contestId: number | undefined,
	context: { userId: number | undefined; isAdmin: boolean }
) {
	const { userId, isAdmin } = context;

	const result = await db
		.select({
			id: problems.id,
			translations: problems.translations,
			isPublic: problems.isPublic,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			problemType: problems.problemType,
			judgeAvailable: problems.judgeAvailable,
			allowedLanguages: problems.allowedLanguages,
			hasSubtasks: problems.hasSubtasks,
			useFullJudge: problems.useFullJudge,
			passThreshold: problems.passThreshold,
			tier: problems.tier,
			tierUpdatedAt: problems.tierUpdatedAt,
			judgePriority: problems.judgePriority,
			authors: sql<
				{
					name: string;
					username: string | null;
					mainExternalSite: ExternalSite | null;
					mainExternalRating: number | null;
				}[]
			>`COALESCE((SELECT json_agg(json_build_object('name', COALESCE(${col(users, users.name)}, ${col(problemAuthors, problemAuthors.externalName)}), 'username', ${col(users, users.username)}, 'mainExternalSite', ${col(users, users.mainExternalSite)}, 'mainExternalRating', ${col(userExternalHandles, userExternalHandles.rating)})) FROM ${tbl(problemAuthors)} LEFT JOIN ${tbl(users)} ON ${col(users, users.id)} = ${col(problemAuthors, problemAuthors.userId)} LEFT JOIN ${tbl(userExternalHandles)} ON ${col(userExternalHandles, userExternalHandles.userId)} = ${col(users, users.id)} AND ${col(userExternalHandles, userExternalHandles.provider)} = ${col(users, users.mainExternalSite)} WHERE ${col(problemAuthors, problemAuthors.problemId)} = ${col(problems, problems.id)}), '[]'::json)`,
			reviewers: sql<
				{
					name: string;
					username: string | null;
					mainExternalSite: ExternalSite | null;
					mainExternalRating: number | null;
				}[]
			>`COALESCE((SELECT json_agg(json_build_object('name', COALESCE(${col(users, users.name)}, ${col(problemReviewers, problemReviewers.externalName)}), 'username', ${col(users, users.username)}, 'mainExternalSite', ${col(users, users.mainExternalSite)}, 'mainExternalRating', ${col(userExternalHandles, userExternalHandles.rating)})) FROM ${tbl(problemReviewers)} LEFT JOIN ${tbl(users)} ON ${col(users, users.id)} = ${col(problemReviewers, problemReviewers.userId)} LEFT JOIN ${tbl(userExternalHandles)} ON ${col(userExternalHandles, userExternalHandles.userId)} = ${col(users, users.id)} AND ${col(userExternalHandles, userExternalHandles.provider)} = ${col(users, users.mainExternalSite)} WHERE ${col(problemReviewers, problemReviewers.problemId)} = ${col(problems, problems.id)}), '[]'::json)`,
			referenceCodePath: problems.referenceCodePath,
			maxScore: problems.maxScore,
			createdAt: problems.createdAt,
		})
		.from(problems)
		.where(eq(problems.id, id))
		.limit(1);

	const problem = result[0] ?? null;

	if (!problem) {
		return null;
	}

	const display = resolveDisplay(problem.translations as Translations);
	const problemWithDisplay = {
		...problem,
		title: display.title,
		content: display.content,
	};

	// 연결된 출처(sources) — 각 출처의 루트→리프 경로 배열. 리프에는 출처 내 문제 번호(problemNumber)가 달릴 수 있다.
	const attached = await db
		.select({
			sourceId: problemSources.sourceId,
			problemNumber: problemSources.problemNumber,
		})
		.from(problemSources)
		.where(eq(problemSources.problemId, id));

	const sourcePaths = await Promise.all(
		attached.map(async (a) => {
			const chain = await getAncestorChain(a.sourceId);
			return {
				problemNumber: a.problemNumber,
				segments: chain.map((c) => ({ id: c.id, name: c.name })),
			};
		})
	);

	const problemWithSources = { ...problemWithDisplay, sources: sourcePaths };

	if (problemWithDisplay.isPublic) {
		return problemWithSources;
	}

	if (isAdmin) {
		return problemWithSources;
	}

	const isInContest = await db
		.select({ contestId: contestProblems.contestId })
		.from(contestProblems)
		.where(eq(contestProblems.problemId, id))
		.limit(1);

	if (isInContest.length > 0 && !contestId) {
		return null;
	}

	if (!userId) {
		return null;
	}

	// Operators of a contest containing this problem can always view it (no start-time gate)
	const operatorAccess = await db
		.select({ contestId: contestOperators.contestId })
		.from(contestOperators)
		.innerJoin(contestProblems, eq(contestOperators.contestId, contestProblems.contestId))
		.where(
			and(
				eq(contestProblems.problemId, id),
				eq(contestOperators.userId, userId),
				contestId ? eq(contestOperators.contestId, contestId) : undefined
			)
		)
		.limit(1);

	if (operatorAccess.length > 0) {
		return problemWithSources;
	}

	if (contestId) {
		const [contest] = await db
			.select({ startTime: contests.startTime })
			.from(contests)
			.where(eq(contests.id, contestId))
			.limit(1);

		if (!contest || new Date() < contest.startTime) {
			return null;
		}
	}

	const contestAccess = await db
		.select({
			contestId: contestProblems.contestId,
		})
		.from(contestProblems)
		.innerJoin(contestParticipants, eq(contestProblems.contestId, contestParticipants.contestId))
		.where(
			and(
				eq(contestProblems.problemId, id),
				eq(contestParticipants.userId, userId),
				contestId ? eq(contestProblems.contestId, contestId) : undefined
			)
		)
		.limit(1);

	if (contestAccess.length === 0) {
		return null;
	}

	return problemWithSources;
}

export async function getProblemForEdit(id: number) {
	const [problem] = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
	return problem || null;
}

// ---- Problem staff (authors / reviewers) ----

type StaffRole = "author" | "reviewer";

export type ProblemStaffEntry = {
	id: number; // problem_authors/reviewers row id
	userId: number | null;
	username: string | null;
	name: string; // display name: user.name if userId, else externalName
	externalName: string | null;
};

export type StaffTarget = { userId: number } | { externalName: string };

function staffTable(role: StaffRole) {
	return role === "author" ? problemAuthors : problemReviewers;
}

async function listStaff(
	table: typeof problemAuthors | typeof problemReviewers,
	problemId: number
): Promise<ProblemStaffEntry[]> {
	const rows = await db
		.select({
			id: table.id,
			userId: table.userId,
			externalName: table.externalName,
			username: users.username,
			userName: users.name,
			createdAt: table.createdAt,
		})
		.from(table)
		.leftJoin(users, eq(users.id, table.userId))
		.where(eq(table.problemId, problemId))
		.orderBy(asc(table.createdAt));

	return rows.map((r) => ({
		id: r.id,
		userId: r.userId,
		username: r.username,
		name: r.userName ?? r.externalName ?? "",
		externalName: r.externalName,
	}));
}

export async function getProblemStaff(problemId: number) {
	const [authors, reviewers] = await Promise.all([
		listStaff(problemAuthors, problemId),
		listStaff(problemReviewers, problemId),
	]);
	return { authors, reviewers };
}

export async function addProblemStaff(
	problemId: number,
	role: StaffRole,
	target: StaffTarget
): Promise<{ success: boolean }> {
	const table = staffTable(role);
	if ("userId" in target) {
		await db
			.insert(table)
			.values({ problemId, userId: target.userId, externalName: null })
			.onConflictDoNothing();
	} else {
		const trimmed = target.externalName.trim();
		if (trimmed.length === 0) {
			throw new Error("외부 출제자/검수자 이름이 비어있습니다.");
		}
		await db
			.insert(table)
			.values({ problemId, userId: null, externalName: trimmed })
			.onConflictDoNothing();
	}
	return { success: true };
}

export async function removeProblemStaff(
	problemId: number,
	role: StaffRole,
	staffId: number
): Promise<{ success: boolean }> {
	const table = staffTable(role);
	await db.delete(table).where(and(eq(table.problemId, problemId), eq(table.id, staffId)));
	return { success: true };
}

// ---- Translation CRUD ----

export async function getTranslations(problemId: number): Promise<Translations | null> {
	const [row] = await db
		.select({ translations: problems.translations })
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);
	return row ? (row.translations as Translations) : null;
}

export async function upsertTranslation(
	problemId: number,
	language: LanguageCode,
	patch: { title: string; content: string; translatorId?: number | null }
): Promise<Translations> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ translations: problems.translations })
			.from(problems)
			.where(eq(problems.id, problemId))
			.for("update")
			.limit(1);
		if (!row) throw new Error(`Problem ${problemId} not found`);
		const current = row.translations as Translations;

		const now = nowIso();
		const existing = current.entries[language];
		const next: Translations = {
			original: current.original,
			entries: {
				...current.entries,
				[language]: {
					title: patch.title,
					content: patch.content,
					translatorId: patch.translatorId ?? existing?.translatorId ?? null,
					createdAt: existing?.createdAt ?? now,
					updatedAt: now,
				},
			},
		};

		const validated = translationsSchema.parse(next);

		await tx
			.update(problems)
			.set({ translations: validated as Translations, updatedAt: new Date() })
			.where(eq(problems.id, problemId));

		return validated as Translations;
	});
}

export async function deleteTranslation(
	problemId: number,
	language: LanguageCode
): Promise<Translations> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ translations: problems.translations })
			.from(problems)
			.where(eq(problems.id, problemId))
			.for("update")
			.limit(1);
		if (!row) throw new Error(`Problem ${problemId} not found`);
		const current = row.translations as Translations;

		if (current.original === language) {
			throw new Error("원문은 삭제할 수 없습니다. 다른 언어를 먼저 원문으로 지정하세요.");
		}
		if (!(language in current.entries)) {
			throw new Error(`Translation for ${language} does not exist`);
		}

		const { [language]: _removed, ...rest } = current.entries;
		const next: Translations = {
			original: current.original,
			entries: rest,
		};

		const validated = translationsSchema.parse(next);

		await tx
			.update(problems)
			.set({ translations: validated as Translations, updatedAt: new Date() })
			.where(eq(problems.id, problemId));

		return validated as Translations;
	});
}

export async function promoteOriginal(
	problemId: number,
	language: LanguageCode
): Promise<Translations> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ translations: problems.translations })
			.from(problems)
			.where(eq(problems.id, problemId))
			.for("update")
			.limit(1);
		if (!row) throw new Error(`Problem ${problemId} not found`);
		const current = row.translations as Translations;

		if (!(language in current.entries)) {
			throw new Error(`Cannot promote: ${language} translation does not exist`);
		}

		const next: Translations = {
			original: language,
			entries: current.entries,
		};

		const validated = translationsSchema.parse(next);

		await tx
			.update(problems)
			.set({ translations: validated as Translations, updatedAt: new Date() })
			.where(eq(problems.id, problemId));

		return validated as Translations;
	});
}

export async function searchProblemsForAdmin(query: string, limit = 10) {
	const trimmed = query.trim();
	if (!trimmed) return [] as { id: number; title: string }[];
	const numeric = Number.parseInt(trimmed, 10);
	const titleMatch = sql`${problems.displayTitle} ILIKE ${`%${trimmed}%`}`;
	const where = Number.isFinite(numeric) ? or(eq(problems.id, numeric), titleMatch) : titleMatch;
	const rows = await db
		.select({ id: problems.id, title: problems.displayTitle })
		.from(problems)
		.where(where)
		.orderBy(asc(problems.id))
		.limit(limit);
	return rows;
}
