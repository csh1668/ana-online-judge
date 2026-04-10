import { and, count, countDistinct, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type Language, submissions } from "@/db/schema";

export type ProblemStats = {
	totalSubmissions: number;
	acceptedSubmissions: number;
	acceptedUsers: number;
	acceptRate: string;
};

export type ProblemRankingItem = {
	id: number;
	userId: number;
	userName: string;
	language: Language;
	executionTime: number | null;
	memoryUsed: number | null;
	codeLength: number | null;
	createdAt: Date;
};

export type ProblemRanking = {
	rankings: ProblemRankingItem[];
	total: number;
};

export async function getProblemStats(
	problemId: number,
	contestId?: number
): Promise<ProblemStats> {
	const baseConditions = contestId
		? and(eq(submissions.problemId, problemId), eq(submissions.contestId, contestId))
		: eq(submissions.problemId, problemId);

	const acceptedConditions = and(baseConditions, eq(submissions.verdict, "accepted"));

	const [totalResult, acceptedResult, acceptedUsersResult] = await Promise.all([
		db.select({ count: count() }).from(submissions).where(baseConditions),
		db.select({ count: count() }).from(submissions).where(acceptedConditions),
		db
			.select({ count: countDistinct(submissions.userId) })
			.from(submissions)
			.where(acceptedConditions),
	]);

	const totalSubmissions = totalResult[0].count;
	const acceptedSubmissions = acceptedResult[0].count;
	const acceptedUsers = acceptedUsersResult[0].count;
	const acceptRate =
		totalSubmissions > 0 ? ((acceptedSubmissions / totalSubmissions) * 100).toFixed(1) : "0.0";

	return { totalSubmissions, acceptedSubmissions, acceptedUsers, acceptRate };
}

export async function getProblemRanking(
	problemId: number,
	options?: {
		sortBy?: "executionTime" | "codeLength";
		language?: string;
		page?: number;
		limit?: number;
		contestId?: number;
	}
): Promise<ProblemRanking> {
	const sortBy = options?.sortBy ?? "executionTime";
	const language = options?.language;
	const contestId = options?.contestId;
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const sortColumnName = sortBy === "executionTime" ? "execution_time" : "code_length";
	const sortByField = sortBy === "executionTime" ? "executionTime" : "codeLength";

	const languageFilter = language && language !== "all" ? sql`AND s.language = ${language}` : sql``;
	const contestFilter = contestId ? sql`AND s.contest_id = ${contestId}` : sql``;

	// Count distinct users with accepted submissions
	const countConditions = [
		eq(submissions.problemId, problemId),
		eq(submissions.verdict, "accepted"),
	];
	if (language && language !== "all") {
		countConditions.push(eq(submissions.language, language as Language));
	}
	if (contestId) {
		countConditions.push(eq(submissions.contestId, contestId));
	}

	const totalResult = await db
		.select({ count: countDistinct(submissions.userId) })
		.from(submissions)
		.where(and(...countConditions));

	const total = totalResult[0].count;

	// Get best submission per user using DISTINCT ON, then re-order
	const result = await db.execute<{
		id: number;
		userId: number;
		userName: string;
		language: Language;
		executionTime: number | null;
		memoryUsed: number | null;
		codeLength: number | null;
		createdAt: Date;
	}>(sql`
		SELECT * FROM (
			SELECT DISTINCT ON (s.user_id)
				s.id,
				s.user_id AS "userId",
				u.name AS "userName",
				s.language,
				s.execution_time AS "executionTime",
				s.memory_used AS "memoryUsed",
				s.code_length AS "codeLength",
				s.created_at AS "createdAt"
			FROM submissions s
			INNER JOIN users u ON s.user_id = u.id
			WHERE s.problem_id = ${problemId}
				AND s.verdict = 'accepted'
				${languageFilter}
				${contestFilter}
			ORDER BY s.user_id, s.${sql.raw(sortColumnName)} ASC NULLS LAST
		) sub
		ORDER BY sub.${sql.raw(`"${sortByField}"`)} ASC NULLS LAST
		LIMIT ${limit} OFFSET ${offset}
	`);

	return {
		rankings: result as unknown as ProblemRankingItem[],
		total,
	};
}
