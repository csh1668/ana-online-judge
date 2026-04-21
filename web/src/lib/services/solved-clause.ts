import { and, count, eq, gte, ne, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { problems, submissions } from "@/db/schema";

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

/**
 * drizzle builder용 canonical "풀었다" 필터 SQL.
 * 호출 측 쿼리가 `problems` 테이블을 FROM 하고 있을 때 WHERE 조건으로 사용.
 *
 * `userSolvedProblemSql`은 raw SQL에서 `problems p` alias를 가정하는 반면,
 * 이 함수는 drizzle 기본 alias(`problems`)를 참조해서 `db.select().from(problems).where(...)`
 * 안에 그대로 끼워넣을 수 있다.
 */
export function userSolvedProblemFilterSql(userId: number): SQL {
	return sql`(
		(${problems.problemType} != 'anigma' AND EXISTS (
			SELECT 1 FROM ${submissions} sub_us
			WHERE sub_us.problem_id = ${problems.id}
			  AND sub_us.user_id = ${userId}
			  AND sub_us.score = ${problems.maxScore}
		))
		OR
		(${problems.problemType} = 'anigma' AND (
			SELECT COALESCE(MAX(CASE WHEN sub_us.anigma_task_type = 1 THEN sub_us.score END), 0)
			     + COALESCE(MAX(CASE WHEN sub_us.anigma_task_type = 2 THEN sub_us.score END), 0)
			FROM ${submissions} sub_us
			WHERE sub_us.problem_id = ${problems.id} AND sub_us.user_id = ${userId}
		) >= ${ANIGMA_SOLVED_THRESHOLD})
	)`;
}

/**
 * 문제별 canonical "푼 사람 수" 집계 subquery를 생성.
 *
 * 반환 subquery shape: `(problemId, solverCount)`
 * 사용:
 * ```
 * const solverStats = makeCanonicalSolverStatsSubquery();
 * db.select({ ... solverCount: sql`COALESCE(${solverStats.solverCount}, 0)` })
 *   .from(problems)
 *   .leftJoin(solverStats, eq(problems.id, solverStats.problemId));
 * ```
 *
 * 내부적으로 2단계 집계(per (problem, user) → per problem)를 수행하므로
 * 한 쿼리에 1회만 join 가능. 호출마다 새 subquery 인스턴스를 반환한다.
 */
export function makeCanonicalSolverStatsSubquery() {
	const userProblemAgg = db
		.select({
			problemId: submissions.problemId,
			userId: submissions.userId,
			bestScore: sql<number>`MAX(${submissions.score})`.as("best_score"),
			t1: sql<number>`MAX(CASE WHEN ${submissions.anigmaTaskType} = 1 THEN ${submissions.score} END)`.as(
				"t1"
			),
			t2: sql<number>`MAX(CASE WHEN ${submissions.anigmaTaskType} = 2 THEN ${submissions.score} END)`.as(
				"t2"
			),
			problemType: problems.problemType,
			maxScore: problems.maxScore,
		})
		.from(submissions)
		.innerJoin(problems, eq(problems.id, submissions.problemId))
		.groupBy(submissions.problemId, submissions.userId, problems.problemType, problems.maxScore)
		.as("up");

	return db
		.select({
			problemId: userProblemAgg.problemId,
			solverCount: count().as("sv"),
		})
		.from(userProblemAgg)
		.where(
			or(
				and(
					ne(userProblemAgg.problemType, "anigma"),
					eq(userProblemAgg.bestScore, userProblemAgg.maxScore)
				),
				and(
					eq(userProblemAgg.problemType, "anigma"),
					gte(
						sql<number>`COALESCE(${userProblemAgg.t1}, 0) + COALESCE(${userProblemAgg.t2}, 0)`,
						ANIGMA_SOLVED_THRESHOLD
					)
				)
			)
		)
		.groupBy(userProblemAgg.problemId)
		.as("solver_stats");
}

/**
 * 한 사용자가 canonical 기준으로 "푼 문제 수"를 반환하는 스칼라 SQL.
 * ranking/profile 등에서 `SELECT ... (this) AS solved_count ...` 형태로 사용.
 */
export function userSolvedCountSql(userId: number): SQL<number> {
	return sql<number>`(
		SELECT COUNT(*)::int FROM (
			SELECT s.problem_id
			FROM submissions s
			INNER JOIN problems p2 ON p2.id = s.problem_id
			WHERE s.user_id = ${userId}
			GROUP BY s.problem_id, p2.problem_type, p2.max_score
			HAVING
				(p2.problem_type != 'anigma' AND MAX(s.score) = p2.max_score)
				OR
				(p2.problem_type = 'anigma'
					AND COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
					  + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0)
					  >= ${ANIGMA_SOLVED_THRESHOLD})
		) solved
	)`;
}
