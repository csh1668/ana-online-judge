"use server";

import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { problems, submissions, users } from "@/db/schema";

export type ProblemListItem = {
	id: number;
	title: string;
	isPublic: boolean;
	timeLimit: number;
	memoryLimit: number;
	authorName: string | null;
	submissionCount: number;
	acceptedCount: number;
	createdAt: Date;
};

export async function getProblems(options?: {
	page?: number;
	limit?: number;
	publicOnly?: boolean;
}): Promise<{ problems: ProblemListItem[]; total: number }> {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const publicOnly = options?.publicOnly ?? true;

	const whereCondition = publicOnly ? eq(problems.isPublic, true) : undefined;

	// Get problems with author info
	const problemsQuery = db
		.select({
			id: problems.id,
			title: problems.title,
			isPublic: problems.isPublic,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
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

	const enrichedProblems: ProblemListItem[] = problemsList.map((p) => ({
		...p,
		submissionCount: statsMap.get(p.id)?.submissionCount ?? 0,
		acceptedCount: statsMap.get(p.id)?.acceptedCount ?? 0,
	}));

	return {
		problems: enrichedProblems,
		total: totalResult[0].count,
	};
}

export async function getProblemById(id: number) {
	const result = await db
		.select({
			id: problems.id,
			title: problems.title,
			content: problems.content,
			isPublic: problems.isPublic,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			authorId: problems.authorId,
			authorName: users.name,
			createdAt: problems.createdAt,
		})
		.from(problems)
		.leftJoin(users, eq(problems.authorId, users.id))
		.where(eq(problems.id, id))
		.limit(1);

	return result[0] ?? null;
}
