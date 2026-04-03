"use server";

import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { contestParticipants, contestProblems, problems, submissions, users } from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";

export async function getProblems(options?: {
	page?: number;
	limit?: number;
	publicOnly?: boolean;
	search?: string;
	sort?: "id" | "title" | "createdAt" | "acceptRate" | "submissionCount";
	order?: "asc" | "desc";
	filter?: "all" | "unsolved" | "solved" | "wrong" | "new";
	userId?: number;
}) {
	const { isAdmin } = await getSessionInfo();

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const filter = options?.filter ?? "all";
	const sort = filter === "new" ? "createdAt" : (options?.sort ?? "id");
	const order = filter === "new" ? "desc" : (options?.order ?? "asc");

	// Admin can see all problems, others only see public problems
	const publicOnly = isAdmin ? false : (options?.publicOnly ?? true);

	const conditions: SQL[] = [];
	if (publicOnly) {
		conditions.push(eq(problems.isPublic, true));
	}
	if (options?.search) {
		conditions.push(sql`${problems.title} ILIKE ${`%${options.search}%`}`);
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
			// Problems where user has at least one AC
			conditions.push(
				sql`EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId} AND ${submissions.verdict} = 'accepted')`
			);
		} else if (filter === "wrong") {
			// Problems where user submitted but never got AC
			conditions.push(
				sql`EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId})`
			);
			conditions.push(
				sql`NOT EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId} AND ${submissions.verdict} = 'accepted')`
			);
		} else if (filter === "unsolved") {
			// Problems where user has no AC (including never submitted)
			conditions.push(
				sql`NOT EXISTS (SELECT 1 FROM ${submissions} WHERE ${submissions.problemId} = ${problems.id} AND ${submissions.userId} = ${userId} AND ${submissions.verdict} = 'accepted')`
			);
		}
	}

	const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

	// Build ORDER BY
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
		default:
			orderBy = order === "asc" ? asc(problems.id) : desc(problems.id);
			break;
	}

	// Main query with LEFT JOIN to stats subquery
	const problemsQuery = db
		.select({
			id: problems.id,
			title: problems.title,
			isPublic: problems.isPublic,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			problemType: problems.problemType,
			judgeAvailable: problems.judgeAvailable,
			authorName: users.name,
			createdAt: problems.createdAt,
			submissionCount: sql<number>`COALESCE(${statsSq.submissionCount}, 0)`,
			acceptedCount: sql<number>`COALESCE(${statsSq.acceptedCount}, 0)`,
		})
		.from(problems)
		.leftJoin(users, eq(problems.authorId, users.id))
		.leftJoin(statsSq, eq(problems.id, statsSq.problemId))
		.where(whereCondition)
		.orderBy(orderBy)
		.limit(limit)
		.offset(offset);

	// Count query (without stats join since it's only for total)
	const countQuery = db.select({ count: count() }).from(problems).where(whereCondition);

	const [problemsList, totalResult] = await Promise.all([problemsQuery, countQuery]);

	return {
		problems: problemsList,
		total: totalResult[0].count,
	};
}

export async function getProblemById(id: number, contestId?: number) {
	const { userId, isAdmin } = await getSessionInfo();

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
			authorId: problems.authorId,
			authorName: users.name,
			referenceCodePath: problems.referenceCodePath,
			createdAt: problems.createdAt,
		})
		.from(problems)
		.leftJoin(users, eq(problems.authorId, users.id))
		.where(eq(problems.id, id))
		.limit(1);

	const problem = result[0] ?? null;

	if (!problem) {
		return null;
	}

	// If problem is public, allow access
	if (problem.isPublic) {
		return problem;
	}

	// If user is admin, allow access
	if (isAdmin) {
		return problem;
	}

	// If problem is not public, check if it's in any contest
	const isInContest = await db
		.select({ contestId: contestProblems.contestId })
		.from(contestProblems)
		.where(eq(contestProblems.problemId, id))
		.limit(1);

	// If problem is in a contest and contestId is not provided, deny access
	// (must access through /contests/[id]/problems/[label])
	if (isInContest.length > 0 && !contestId) {
		return null;
	}

	// If problem is not public, check if user has access through a contest
	if (!userId) {
		return null;
	}

	// Check if problem is in a contest that the user is participating in
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

	return problem;
}

export type GetProblemsReturn = Awaited<ReturnType<typeof getProblems>>;
export type ProblemListItem = GetProblemsReturn["problems"][number];
export type GetProblemByIdReturn = Awaited<ReturnType<typeof getProblemById>>;
