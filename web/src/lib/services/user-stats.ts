import { and, count, countDistinct, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { submissions } from "@/db/schema";

export type UserStats = {
	solvedCount: number;
	submissionCount: number;
	acceptRate: string;
};

export async function getUserStats(userId: number): Promise<UserStats> {
	const [submissionResult, solvedResult] = await Promise.all([
		db.select({ count: count() }).from(submissions).where(eq(submissions.userId, userId)),
		db
			.select({ count: countDistinct(submissions.problemId) })
			.from(submissions)
			.where(and(eq(submissions.userId, userId), eq(submissions.verdict, "accepted"))),
	]);

	const submissionCount = submissionResult[0].count;
	const solvedCount = solvedResult[0].count;
	const acceptRate =
		submissionCount > 0 ? ((solvedCount / submissionCount) * 100).toFixed(1) : "0.0";

	return { solvedCount, submissionCount, acceptRate };
}

export type HeatmapData = { date: string; count: number }[];

export async function getUserHeatmap(userId: number): Promise<HeatmapData> {
	const oneYearAgo = new Date();
	oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

	const result = await db.execute<{ date: string; count: number }>(sql`
		SELECT
			TO_CHAR(s.created_at, 'YYYY-MM-DD') AS "date",
			COUNT(DISTINCT s.problem_id)::int AS "count"
		FROM submissions s
		WHERE s.user_id = ${userId}
			AND s.verdict = 'accepted'
			AND s.created_at >= ${oneYearAgo.toISOString()}
		GROUP BY TO_CHAR(s.created_at, 'YYYY-MM-DD')
		ORDER BY "date"
	`);

	return result as unknown as HeatmapData;
}

export type LanguageStatsItem = { language: string; count: number };

export async function getUserLanguageStats(userId: number): Promise<LanguageStatsItem[]> {
	const result = await db.execute<{ language: string; count: number }>(sql`
		SELECT
			s.language,
			COUNT(DISTINCT s.problem_id)::int AS "count"
		FROM submissions s
		WHERE s.user_id = ${userId}
			AND s.verdict = 'accepted'
		GROUP BY s.language
		ORDER BY "count" DESC
	`);

	return result as unknown as LanguageStatsItem[];
}
