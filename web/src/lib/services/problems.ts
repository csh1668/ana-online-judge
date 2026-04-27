import { and, asc, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	algorithmTags,
	contestParticipants,
	contestProblems,
	contests,
	type LanguageCode,
	type ProblemType,
	problemAuthors,
	problemConfirmedTags,
	problemReviewers,
	problemSources,
	problems,
	submissions,
	type Translations,
	users,
} from "@/db/schema";
import { col, tbl } from "@/lib/db-helpers";
import { PROBLEM_TABLE_SORT_KEYS, type SortOrder } from "@/lib/services/problem-list-sort";
import { parseProblemSearchQuery } from "@/lib/services/problem-search-query";
import {
	ANIGMA_SOLVED_THRESHOLD,
	makeCanonicalSolverStatsSubquery,
	userSolvedProblemFilterSql,
} from "@/lib/services/solved-clause";
import { getAncestorChain, getDescendantIds } from "@/lib/sources/tree-queries";
import { deleteAllProblemFiles, uploadFile } from "@/lib/storage";
import { nowIso, resolveDisplay } from "@/lib/utils/translations";
import { translationsSchema } from "@/lib/validation/translations";

export async function getAdminProblems(options?: { page?: number; limit?: number }) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const [problemsList, totalResult] = await Promise.all([
		db
			.select({
				id: problems.id,
				title: problems.displayTitle,
				isPublic: problems.isPublic,
				judgeAvailable: problems.judgeAvailable,
				createdAt: problems.createdAt,
			})
			.from(problems)
			.orderBy(desc(problems.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(problems),
	]);

	return {
		problems: problemsList,
		total: totalResult[0].count,
	};
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
	allowedLanguages?: string[] | null;
	referenceCodeBuffer?: Buffer | null;
	solutionCodeBuffer?: Buffer | null;
}) {
	const validatedTranslations = translationsSchema.parse(data.translations);

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
		checkerPath?: string | null;
		validatorPath?: string | null;
		allowedLanguages?: string[] | null;
		referenceCodeBuffer?: Buffer | null;
		solutionCodeBuffer?: Buffer | null;
	}
) {
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
		checkerPath?: string | null;
		validatorPath?: string | null;
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

export const GET_PROBLEMS_SORT_KEYS = [...PROBLEM_TABLE_SORT_KEYS, "createdAt"] as const;
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
				filter?: "all" | "unsolved" | "solved" | "wrong" | "new";
				userId?: number;
				includeUnavailable?: boolean;
				sourceId?: number;
				sourceIdMode?: "descendants" | "direct";
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

	// Submission stats subquery (submission-level metrics).
	// solverCount는 canonical solved 정의(Anigma Task1+Task2≥70 / 일반 score=max_score)를
	// 사용해야 하므로 별도의 makeCanonicalSolverStatsSubquery로 분리.
	const statsSq = db
		.select({
			problemId: submissions.problemId,
			submissionCount: count().as("submission_count"),
			acceptedCount:
				sql<number>`count(case when ${submissions.verdict} = 'accepted' then 1 end)`.as(
					"accepted_count"
				),
		})
		.from(submissions)
		.groupBy(submissions.problemId)
		.as("stats");

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
					? sql`COALESCE(${statsSq.acceptedCount}::float / NULLIF(${statsSq.submissionCount}, 0), 0) ASC`
					: sql`COALESCE(${statsSq.acceptedCount}::float / NULLIF(${statsSq.submissionCount}, 0), 0) DESC`;
			break;
		case "submissionCount":
			orderBy =
				order === "asc"
					? sql`COALESCE(${statsSq.submissionCount}, 0) ASC`
					: sql`COALESCE(${statsSq.submissionCount}, 0) DESC`;
			break;
		case "solverCount":
			orderBy =
				order === "asc"
					? sql`COALESCE(${solverStatsSq.solverCount}, 0) ASC`
					: sql`COALESCE(${solverStatsSq.solverCount}, 0) DESC`;
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
			tier: problems.tier,
			authorNames: sql<
				string[]
			>`COALESCE((SELECT array_agg(${col(users, users.name)}) FROM ${tbl(problemAuthors)} INNER JOIN ${tbl(users)} ON ${col(users, users.id)} = ${col(problemAuthors, problemAuthors.userId)} WHERE ${col(problemAuthors, problemAuthors.problemId)} = ${col(problems, problems.id)}), ARRAY[]::text[])`,
			createdAt: problems.createdAt,
			submissionCount: sql<number>`COALESCE(${statsSq.submissionCount}, 0)`,
			acceptedCount: sql<number>`COALESCE(${statsSq.acceptedCount}, 0)`,
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
			tier: problems.tier,
			tierUpdatedAt: problems.tierUpdatedAt,
			authors: sql<
				{ name: string; username: string }[]
			>`COALESCE((SELECT json_agg(json_build_object('name', ${col(users, users.name)}, 'username', ${col(users, users.username)})) FROM ${tbl(problemAuthors)} INNER JOIN ${tbl(users)} ON ${col(users, users.id)} = ${col(problemAuthors, problemAuthors.userId)} WHERE ${col(problemAuthors, problemAuthors.problemId)} = ${col(problems, problems.id)}), '[]'::json)`,
			reviewers: sql<
				{ name: string; username: string }[]
			>`COALESCE((SELECT json_agg(json_build_object('name', ${col(users, users.name)}, 'username', ${col(users, users.username)})) FROM ${tbl(problemReviewers)} INNER JOIN ${tbl(users)} ON ${col(users, users.id)} = ${col(problemReviewers, problemReviewers.userId)} WHERE ${col(problemReviewers, problemReviewers.problemId)} = ${col(problems, problems.id)}), '[]'::json)`,
			referenceCodePath: problems.referenceCodePath,
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

function staffTable(role: StaffRole) {
	return role === "author" ? problemAuthors : problemReviewers;
}

export async function getProblemStaff(problemId: number) {
	const [authors, reviewers] = await Promise.all([
		db
			.select({ id: users.id, username: users.username, name: users.name })
			.from(problemAuthors)
			.innerJoin(users, eq(users.id, problemAuthors.userId))
			.where(eq(problemAuthors.problemId, problemId))
			.orderBy(asc(users.username)),
		db
			.select({ id: users.id, username: users.username, name: users.name })
			.from(problemReviewers)
			.innerJoin(users, eq(users.id, problemReviewers.userId))
			.where(eq(problemReviewers.problemId, problemId))
			.orderBy(asc(users.username)),
	]);
	return { authors, reviewers };
}

export async function addProblemStaff(problemId: number, userId: number, role: StaffRole) {
	const table = staffTable(role);
	await db.insert(table).values({ problemId, userId }).onConflictDoNothing();
	return { success: true };
}

export async function removeProblemStaff(problemId: number, userId: number, role: StaffRole) {
	const table = staffTable(role);
	await db.delete(table).where(and(eq(table.problemId, problemId), eq(table.userId, userId)));
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
