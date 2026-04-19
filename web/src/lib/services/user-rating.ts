import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * 주어진 사용자의 "푼 문제" 중 tier 내림차순 상위 N개의 tier 값을 반환한다.
 * - EXISTS로 중복 제거 (한 사용자가 같은 문제를 여러 번 AC해도 한 번)
 * - SQL에서 ORDER BY tier DESC + LIMIT으로 상위 N만 가져오므로 JS 정렬·슬라이스 불필요.
 * 조건:
 *  - public 문제 / problems.tier BETWEEN 1 AND 30
 *  - score = max_score / COALESCE(edit_distance, 0) = 0
 */
async function getSolvedTopNTiers(userId: number, n: number): Promise<number[]> {
	const rows = await db.execute<{ tier: number }>(sql`
		SELECT p.tier
		FROM problems p
		WHERE p.is_public = true
		  AND p.tier BETWEEN 1 AND 30
		  AND EXISTS (
		    SELECT 1 FROM submissions s
		    WHERE s.problem_id = p.id
		      AND s.user_id = ${userId}
		      AND s.score = p.max_score
		      AND COALESCE(s.edit_distance, 0) = 0
		  )
		ORDER BY p.tier DESC
		LIMIT ${n}
	`);
	return rows.map((r) => r.tier);
}

/**
 * 사용자가 푼 문제 수 (위 조건과 동일).
 * 레이팅 공식의 count 항에 사용.
 */
async function getSolvedCount(userId: number): Promise<number> {
	const rows = await db.execute<{ cnt: number }>(sql`
		SELECT COUNT(*)::int AS cnt
		FROM problems p
		WHERE p.is_public = true
		  AND p.tier BETWEEN 1 AND 30
		  AND EXISTS (
		    SELECT 1 FROM submissions s
		    WHERE s.problem_id = p.id
		      AND s.user_id = ${userId}
		      AND s.score = p.max_score
		      AND COALESCE(s.edit_distance, 0) = 0
		  )
	`);
	return rows[0]?.cnt ?? 0;
}

/**
 * 주어진 문제를 AC한 사용자 id 목록 반환 (문제의 현재 tier 값과 무관).
 * recomputeProblemTier 이후 fan-out 용도.
 */
export async function getProblemSolvers(problemId: number): Promise<number[]> {
	const rows = await db.execute<{ user_id: number }>(sql`
		SELECT DISTINCT s.user_id
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.problem_id = ${problemId}
		  AND p.is_public = true
		  AND s.score = p.max_score
		  AND COALESCE(s.edit_distance, 0) = 0
	`);
	return rows.map((r) => r.user_id);
}

const TOP_N = 100;

/**
 * 사용자 레이팅 재계산:
 *   rating = topNSum + 200 * (1 - 0.997^count)
 *   - N = 100
 *   - count = 푼 문제 수
 *   - topNSum = 상위 100개 tier 합 (SQL에서 직접 가져옴)
 * users.rating 갱신 후 새 값 반환.
 *
 * 참고: 두 쿼리는 병렬 실행. 트랜잭션은 불필요 (집계가 약간 빗나가더라도
 * 다음 트리거에서 자연 보정되며, 동일 userId에 대한 동시 재계산은 큐 dedup으로 대부분 차단됨).
 */
export async function recomputeUserRating(userId: number): Promise<number> {
	const [topTiers, count] = await Promise.all([
		getSolvedTopNTiers(userId, TOP_N),
		getSolvedCount(userId),
	]);
	const topNSum = topTiers.reduce((acc, t) => acc + t, 0);
	const bonus = 200 * (1 - 0.997 ** count);
	const rating = Math.round(topNSum + bonus);

	await db.update(users).set({ rating }).where(sql`${users.id} = ${userId}`);

	return rating;
}

/** 모든 사용자 id 반환 (admin 전체 재계산용) */
export async function listAllUserIds(): Promise<number[]> {
	const rows = await db.execute<{ id: number }>(sql`SELECT id FROM users`);
	return rows.map((r) => r.id);
}
