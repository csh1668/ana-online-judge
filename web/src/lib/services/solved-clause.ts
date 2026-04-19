import { type SQL, sql } from "drizzle-orm";

/** Anigma 문제가 "풀린" 것으로 인정되는 Task1+Task2 합 임계값 */
export const ANIGMA_SOLVED_THRESHOLD = 70;

/**
 * 사용자가 problems 테이블의 한 row를 "푼 문제"로 인정하는지 검사하는 SQL 조건.
 * 호출 측 SQL에서 problems 테이블이 `p` alias로 노출돼 있어야 한다.
 *
 * - 일반 문제: 어떤 제출이 score = p.max_score 인지 (EXISTS)
 * - Anigma: 사용자의 Task1 최고 점수 + Task2 최고 점수 >= 70
 *   (각 task별 max를 사용하므로 여러 번 제출해도 가장 좋은 점수만 카운트)
 *
 * NOTE: 과거에는 `COALESCE(s.edit_distance, 0) = 0` 조건이 있었으나,
 *       Anigma 룰에 따르면 Task 1/2 점수만 충족되면 인정 (edit_distance는 보너스 영역).
 */
export function userSolvedProblemSql(userId: number): SQL {
	return sql`(
		(p.problem_type != 'anigma' AND EXISTS (
			SELECT 1 FROM submissions s
			WHERE s.problem_id = p.id
			  AND s.user_id = ${userId}
			  AND s.score = p.max_score
		))
		OR
		(p.problem_type = 'anigma' AND (
			SELECT COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
			     + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0)
			FROM submissions s
			WHERE s.problem_id = p.id AND s.user_id = ${userId}
		) >= ${ANIGMA_SOLVED_THRESHOLD})
	)`;
}
