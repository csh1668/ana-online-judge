import { and, asc, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	contestParticipants,
	contestProblems,
	contests,
	type ProblemType,
	problemAuthors,
	problemReviewers,
	problemSources,
	problems,
	submissions,
	users,
} from "@/db/schema";
import { col, tbl } from "@/lib/db-helpers";
import { getAncestorChain, getDescendantIds } from "@/lib/sources/tree-queries";
import { deleteAllProblemFiles, uploadFile } from "@/lib/storage";

export async function getAdminProblems(options?: { page?: number; limit?: number }) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const [problemsList, totalResult] = await Promise.all([
		db
			.select({
				id: problems.id,
				title: problems.title,
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

export async function createProblem(
	data: {
		id?: number;
		title: string;
		content: string;
		timeLimit: number;
		memoryLimit: number;
		maxScore: number;
		isPublic: boolean;
		judgeAvailable?: boolean;
		problemType?: ProblemType;
		allowedLanguages?: string[] | null;
		referenceCodeBuffer?: Buffer | null;
		solutionCodeBuffer?: Buffer | null;
	},
	authorId: number
) {
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
			title: data.title,
			content: data.content,
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

	await db.insert(problemAuthors).values({ problemId: newProblem.id, userId: authorId });

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
		title?: string;
		content?: string;
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
		title?: string;
		content?: string;
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

export async function getProblems(
	options:
		| {
				page?: number;
				limit?: number;
				publicOnly?: boolean;
				search?: string;
				sort?: "id" | "title" | "createdAt" | "acceptRate" | "submissionCount" | "acceptedCount";
				order?: "asc" | "desc";
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
		conditions.push(sql`${problems.title} ILIKE ${`%${options.search}%`}`);
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

	// Submission stats subquery (used for sort and enrichment)
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

	// User status filter subqueries
	if (options?.userId && filter !== "all" && filter !== "new") {
		const userId = options.userId;
		if (filter === "solved") {
			conditions.push(
				sql`EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId} AND ${submissions.verdict} = 'accepted')`
			);
		} else if (filter === "wrong") {
			conditions.push(
				sql`EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId})`
			);
			conditions.push(
				sql`NOT EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId} AND ${submissions.verdict} = 'accepted')`
			);
		} else if (filter === "unsolved") {
			conditions.push(
				sql`NOT EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId} AND ${submissions.verdict} = 'accepted')`
			);
		}
	}

	const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

	let orderBy: SQL;
	switch (sort) {
		case "title":
			orderBy = order === "asc" ? asc(problems.title) : desc(problems.title);
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
		case "acceptedCount":
			orderBy =
				order === "asc"
					? sql`COALESCE(${statsSq.acceptedCount}, 0) ASC`
					: sql`COALESCE(${statsSq.acceptedCount}, 0) DESC`;
			break;
		default:
			orderBy = order === "asc" ? asc(problems.id) : desc(problems.id);
			break;
	}

	const problemsQuery = db
		.select({
			id: problems.id,
			title: problems.title,
			isPublic: problems.isPublic,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			problemType: problems.problemType,
			judgeAvailable: problems.judgeAvailable,
			languageRestricted: sql<boolean>`${problems.allowedLanguages} IS NOT NULL`,
			tier: problems.tier,
			authorNames: sql<
				string[]
			>`COALESCE((SELECT array_agg(${col(users, users.name)}) FROM ${tbl(problemAuthors)} INNER JOIN ${tbl(users)} ON ${col(users, users.id)} = ${col(problemAuthors, problemAuthors.userId)} WHERE ${col(problemAuthors, problemAuthors.problemId)} = ${col(problems, problems.id)}), ARRAY[]::text[])`,
			createdAt: problems.createdAt,
			submissionCount: sql<number>`COALESCE(${statsSq.submissionCount}, 0)`,
			acceptedCount: sql<number>`COALESCE(${statsSq.acceptedCount}, 0)`,
		})
		.from(problems)
		.leftJoin(statsSq, eq(problems.id, statsSq.problemId))
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
			title: problems.title,
			content: problems.content,
			isPublic: problems.isPublic,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			problemType: problems.problemType,
			judgeAvailable: problems.judgeAvailable,
			allowedLanguages: problems.allowedLanguages,
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

	const problemWithSources = { ...problem, sources: sourcePaths };

	if (problem.isPublic) {
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
