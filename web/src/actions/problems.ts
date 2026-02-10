"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { contestParticipants, contestProblems, problems, submissions, users } from "@/db/schema";

export async function getProblems(options?: {
	page?: number;
	limit?: number;
	publicOnly?: boolean;
}) {
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	// Admin can see all problems, others only see public problems
	const publicOnly = isAdmin ? false : (options?.publicOnly ?? true);

	const whereCondition = publicOnly ? eq(problems.isPublic, true) : undefined;

	// Get problems with author info
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
		})
		.from(problems)
		.leftJoin(users, eq(problems.authorId, users.id))
		.where(whereCondition)
		.orderBy(desc(problems.createdAt))
		.limit(limit)
		.offset(offset);

	const [problemsList, totalResult] = await Promise.all([
		problemsQuery,
		db.select({ count: count() }).from(problems).where(whereCondition),
	]);

	// Get submission stats for each problem
	const problemIds = problemsList.map((p) => p.id);

	const statsQuery =
		problemIds.length > 0
			? await db
					.select({
						problemId: submissions.problemId,
						submissionCount: count(),
						acceptedCount: sql<number>`count(case when ${submissions.verdict} = 'accepted' then 1 end)`,
					})
					.from(submissions)
					.where(sql`${submissions.problemId} IN ${problemIds}`)
					.groupBy(submissions.problemId)
			: [];

	const statsMap = new Map(
		statsQuery.map((s) => [
			s.problemId,
			{ submissionCount: s.submissionCount, acceptedCount: s.acceptedCount },
		])
	);

	const enrichedProblems = problemsList.map((p) => ({
		...p,
		submissionCount: statsMap.get(p.id)?.submissionCount ?? 0,
		acceptedCount: statsMap.get(p.id)?.acceptedCount ?? 0,
	}));

	return {
		problems: enrichedProblems,
		total: totalResult[0].count,
	};
}

export async function getProblemById(id: number, contestId?: number) {
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

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
	if (!session?.user?.id) {
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
				eq(contestParticipants.userId, parseInt(session.user.id, 10)),
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
