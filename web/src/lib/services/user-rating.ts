import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ANIGMA_SOLVED_THRESHOLD, userSolvedProblemSql } from "./solved-clause";

/**
 * 주어진 사용자의 "푼 문제" 중 tier 내림차순 상위 N개의 tier 값을 반환한다.
 * - "푼 문제" 정의는 userSolvedProblemSql 참고 (일반: score=max_score / Anigma: Task1+Task2 ≥ 70)
 * - SQL에서 ORDER BY tier DESC + LIMIT으로 상위 N만 가져오므로 JS 정렬·슬라이스 불필요
 * 조건: public 문제 / problems.tier BETWEEN 1 AND 30
 */
async function getSolvedTopNTiers(userId: number, n: number): Promise<number[]> {
	const rows = await db.execute<{ tier: number }>(sql`
		SELECT p.tier
		FROM problems p
		WHERE p.is_public = true
		  AND p.tier BETWEEN 1 AND 30
		  AND ${userSolvedProblemSql(userId)}
		ORDER BY p.tier DESC
		LIMIT ${n}
	`);
	return rows.map((r) => r.tier);
}

/** 사용자가 푼 문제 수 (위와 동일 조건). 레이팅 공식의 count 항에 사용. */
async function getSolvedCount(userId: number): Promise<number> {
	const rows = await db.execute<{ cnt: number }>(sql`
		SELECT COUNT(*)::int AS cnt
		FROM problems p
		WHERE p.is_public = true
		  AND p.tier BETWEEN 1 AND 30
		  AND ${userSolvedProblemSql(userId)}
	`);
	return rows[0]?.cnt ?? 0;
}

/**
 * 주어진 문제를 푼 사용자 id 목록 반환 (문제의 현재 tier 값과 무관).
 * recomputeProblemTier 이후 fan-out 용도.
 *
 * - 일반 문제: score = p.max_score 인 제출이 있는 사용자
 * - Anigma: 사용자별 Task1 max + Task2 max ≥ 70인 사용자
 */
export async function getProblemSolvers(problemId: number): Promise<number[]> {
	const rows = await db.execute<{ user_id: number }>(sql`
		(
			SELECT DISTINCT s.user_id
			FROM submissions s
			JOIN problems p ON p.id = s.problem_id
			WHERE p.id = ${problemId}
			  AND p.is_public = true
			  AND p.problem_type != 'anigma'
			  AND s.score = p.max_score
		)
		UNION
		(
			SELECT t.user_id FROM (
				SELECT s.user_id,
				       COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
				     + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0) AS total
				FROM submissions s
				JOIN problems p ON p.id = s.problem_id
				WHERE p.id = ${problemId}
				  AND p.is_public = true
				  AND p.problem_type = 'anigma'
				GROUP BY s.user_id
			) t
			WHERE t.total >= ${ANIGMA_SOLVED_THRESHOLD}
		)
	`);
	return rows.map((r) => r.user_id);
}

const TOP_N = 100;

/**
 * 사용자 레이팅 재계산:
 *   rating = topNSum + 200 * (1 - 0.997^count)
 *
 * NOTE (single-instance assumption): SELECT 집계 → UPDATE가 트랜잭션/락 없이 수행된다.
 * 단일 Next.js 인스턴스 + in-process 큐 dedup이 직렬화를 담보한다는 가정.
 * 멀티 인스턴스 배포 시 동시 재계산이 발생할 수 있으나 idempotent하므로
 * 영구적 corruption은 없고 다음 트리거에서 자연 보정된다.
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
