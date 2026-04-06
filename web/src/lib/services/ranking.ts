import { sql } from "drizzle-orm";
import { db } from "@/db";

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

	const [rankings, totalResult] = await Promise.all([
		db.execute<RankingItem>(sql`
			SELECT
				u.id AS "userId",
				u.username,
				u.name AS "name",
				u.avatar_url AS "avatarUrl",
				COUNT(DISTINCT CASE WHEN s.verdict = 'accepted' THEN s.problem_id END)::int AS "solvedCount",
				COUNT(s.id)::int AS "submissionCount",
				CASE
					WHEN COUNT(s.id) > 0
					THEN ROUND(COUNT(DISTINCT CASE WHEN s.verdict = 'accepted' THEN s.problem_id END)::numeric / COUNT(s.id) * 100, 1)::text
					ELSE '0.0'
				END AS "acceptRate"
			FROM users u
			LEFT JOIN submissions s ON u.id = s.user_id
			WHERE u.contest_account_only = false
				AND u.is_active = true
			GROUP BY u.id, u.username, u.name, u.avatar_url
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
