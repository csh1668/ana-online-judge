import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { ANIGMA_SOLVED_THRESHOLD, userSolvedCountSql } from "@/lib/services/solved-clause";

export type UserStats = {
	solvedCount: number;
	submissionCount: number;
	acceptRate: string;
};

export async function getUserStats(userId: number): Promise<UserStats> {
	const solvedCountSubquery = userSolvedCountSql(userId);

	const [submissionResult, acceptedResult, solvedResult] = await Promise.all([
		db.select({ count: count() }).from(submissions).where(eq(submissions.userId, userId)),
		db
			.select({ count: count() })
			.from(submissions)
			.where(and(eq(submissions.userId, userId), eq(submissions.verdict, "accepted"))),
		db.execute<{ cnt: number }>(sql`SELECT ${solvedCountSubquery} AS cnt`),
	]);

	const submissionCount = submissionResult[0].count;
	const acceptedCount = acceptedResult[0].count;
	const solvedCount = (solvedResult as unknown as { cnt: number }[])[0]?.cnt ?? 0;
	const acceptRate =
		submissionCount > 0 ? ((acceptedCount / submissionCount) * 100).toFixed(1) : "0.0";

	return { solvedCount, submissionCount, acceptRate };
}

export type HeatmapData = { date: string; count: number }[];

/**
 * 최근 1년 일별 "푼 문제" 수.
 * "푼 문제"는 canonical 정의(일반: MAX(score)=max_score / Anigma: Task1+Task2 ≥ 70).
 * 문제별 "푼 날짜"는 해당 사용자의 accepted 제출 중 가장 빠른 시각으로 정의.
 */
export async function getUserHeatmap(userId: number): Promise<HeatmapData> {
	const oneYearAgo = new Date();
	oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

	const result = await db.execute<{ date: string; count: number }>(sql`
		WITH solved_problems AS (
			SELECT s.problem_id
			FROM submissions s
			INNER JOIN problems p ON p.id = s.problem_id
			WHERE s.user_id = ${userId}
			GROUP BY s.problem_id, p.problem_type, p.max_score
			HAVING
				(p.problem_type != 'anigma' AND MAX(s.score) = p.max_score)
				OR
				(p.problem_type = 'anigma'
					AND COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
					  + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0)
					  >= ${ANIGMA_SOLVED_THRESHOLD})
		),
		first_solve AS (
			SELECT s.problem_id, MIN(s.created_at) AS solved_at
			FROM submissions s
			INNER JOIN solved_problems sp ON sp.problem_id = s.problem_id
			WHERE s.user_id = ${userId}
			  AND s.verdict = 'accepted'
			GROUP BY s.problem_id
		)
		SELECT
			TO_CHAR(solved_at, 'YYYY-MM-DD') AS "date",
			COUNT(*)::int AS "count"
		FROM first_solve
		WHERE solved_at >= ${oneYearAgo.toISOString()}
		GROUP BY TO_CHAR(solved_at, 'YYYY-MM-DD')
		ORDER BY "date"
	`);

	return result as unknown as HeatmapData;
}

export type LanguageStatsItem = { language: string; count: number };

/**
 * 언어별 "푼 문제" 수.
 * "푼 문제"는 canonical 정의. 같은 문제를 여러 언어로 풀면 각 언어에 1씩 집계.
 */
export async function getUserLanguageStats(userId: number): Promise<LanguageStatsItem[]> {
	const result = await db.execute<{ language: string; count: number }>(sql`
		WITH solved_problems AS (
			SELECT s.problem_id
			FROM submissions s
			INNER JOIN problems p ON p.id = s.problem_id
			WHERE s.user_id = ${userId}
			GROUP BY s.problem_id, p.problem_type, p.max_score
			HAVING
				(p.problem_type != 'anigma' AND MAX(s.score) = p.max_score)
				OR
				(p.problem_type = 'anigma'
					AND COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
					  + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0)
					  >= ${ANIGMA_SOLVED_THRESHOLD})
		)
		SELECT
			s.language,
			COUNT(DISTINCT s.problem_id)::int AS "count"
		FROM submissions s
		INNER JOIN solved_problems sp ON sp.problem_id = s.problem_id
		WHERE s.user_id = ${userId}
		  AND s.verdict = 'accepted'
		GROUP BY s.language
		ORDER BY "count" DESC
	`);

	return result as unknown as LanguageStatsItem[];
}
