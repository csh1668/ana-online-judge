import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ANIGMA_SOLVED_THRESHOLD } from "@/lib/services/solved-clause";

export type RankingItem = {
	userId: number;
	username: string;
	name: string;
	avatarUrl: string | null;
	solvedCount: number;
	submissionCount: number;
	acceptRate: string;
};

export type RankingResult = {
	rankings: RankingItem[];
	total: number;
};

export async function getUserRanking(options?: {
	page?: number;
	limit?: number;
}): Promise<RankingResult> {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 50;
	const offset = (page - 1) * limit;

	// solvedCount는 canonical 정의(일반: MAX(score)=max_score / Anigma: Task1+Task2≥70)로 계산.
	// acceptRate는 "accepted 제출 수 / 전체 제출 수"로 통일 (user-stats.ts / problem-stats.ts와 일관).
	const [rankings, totalResult] = await Promise.all([
		db.execute<RankingItem>(sql`
			WITH user_solved AS (
				SELECT s.user_id, s.problem_id
				FROM submissions s
				INNER JOIN problems p ON p.id = s.problem_id
				GROUP BY s.user_id, s.problem_id, p.problem_type, p.max_score
				HAVING
					(p.problem_type != 'anigma' AND MAX(s.score) = p.max_score)
					OR
					(p.problem_type = 'anigma'
						AND COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
						  + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0)
						  >= ${ANIGMA_SOLVED_THRESHOLD})
			),
			sub_stats AS (
				SELECT
					user_id,
					COUNT(*)::int AS submission_count,
					COUNT(CASE WHEN verdict = 'accepted' THEN 1 END)::int AS accepted_count
				FROM submissions
				GROUP BY user_id
			),
			solve_stats AS (
				SELECT user_id, COUNT(*)::int AS solved_count
				FROM user_solved
				GROUP BY user_id
			)
			SELECT
				u.id AS "userId",
				u.username,
				u.name AS "name",
				u.avatar_url AS "avatarUrl",
				COALESCE(ss.solved_count, 0)::int AS "solvedCount",
				COALESCE(subs.submission_count, 0)::int AS "submissionCount",
				CASE
					WHEN COALESCE(subs.submission_count, 0) > 0
					THEN ROUND(
						COALESCE(subs.accepted_count, 0)::numeric
						/ subs.submission_count * 100, 1
					)::text
					ELSE '0.0'
				END AS "acceptRate"
			FROM users u
			LEFT JOIN sub_stats subs ON subs.user_id = u.id
			LEFT JOIN solve_stats ss ON ss.user_id = u.id
			WHERE u.contest_account_only = false
				AND u.is_active = true
			ORDER BY "solvedCount" DESC, "submissionCount" ASC
			LIMIT ${limit} OFFSET ${offset}
		`),
		db.execute<{ count: number }>(sql`
			SELECT COUNT(*)::int AS "count"
			FROM users
			WHERE contest_account_only = false AND is_active = true
		`),
	]);

	return {
		rankings: rankings as unknown as RankingItem[],
		total: (totalResult as unknown as { count: number }[])[0].count,
	};
}
