import { and, count, eq, gte, ne, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { problems, submissions } from "@/db/schema";

/** Anigma 문제가 "풀린" 것으로 인정되는 Task1+Task2 합 임계값 */
export const ANIGMA_SOLVED_THRESHOLD = 70;

/**
 * 외부 컨텍스트의 user_id (SQL fragment)를 받아 canonical "풀었다" 조건을 반환.
 * 호출 측 SQL에서 problems 테이블이 `p` alias로 노출돼 있어야 한다.
 *
 * 일반/Anigma 분기 정의는 userSolvedProblemSql 참고.
 */
function userSolvedProblemClause(userIdSql: SQL): SQL {
	return sql`(
		(p.problem_type != 'anigma' AND EXISTS (
			SELECT 1 FROM submissions s
			WHERE s.problem_id = p.id
			  AND s.user_id = ${userIdSql}
			  AND s.score = p.max_score
		))
		OR
		(p.problem_type = 'anigma' AND (
			SELECT COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
			     + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0)
			FROM submissions s
			WHERE s.problem_id = p.id AND s.user_id = ${userIdSql}
		) >= ${ANIGMA_SOLVED_THRESHOLD})
	)`;
}

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
	return userSolvedProblemClause(sql`${userId}`);
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

const solvedPairKey = (userId: number, problemId: number) => `${userId}:${problemId}`;

/**
 * 여러 (userId, problemId) 페어에 대해 canonical "풀었다" 여부를 일괄 확인.
 * 입력 페어는 dedup 되며, solved=true인 페어 키 집합 (`${userId}:${problemId}`)을 반환한다.
 *
 * `userSolvedProblemSql` 과 동일한 정의를 한 번의 쿼리로 수행하기 위한 헬퍼.
 * row-level visibility 결정 등 (submitter, problemId) 페어가 가변인 배치 케이스에서 사용.
 */
export async function getSolvedPairs(
	pairs: { userId: number; problemId: number }[]
): Promise<Set<string>> {
	if (pairs.length === 0) return new Set();

	const dedup = new Map<string, { userId: number; problemId: number }>();
	for (const pair of pairs) dedup.set(solvedPairKey(pair.userId, pair.problemId), pair);
	const unique = Array.from(dedup.values());

	const valuesPart = sql.join(
		unique.map((pair) => sql`(${pair.userId}::int, ${pair.problemId}::int)`),
		sql`, `
	);

	const rows = await db.execute<{ user_id: number; problem_id: number }>(sql`
		SELECT q.user_id, q.problem_id
		FROM (VALUES ${valuesPart}) AS q(user_id, problem_id)
		JOIN problems p ON p.id = q.problem_id
		WHERE ${userSolvedProblemClause(sql`q.user_id`)}
	`);

	return new Set(rows.map((r) => solvedPairKey(r.user_id, r.problem_id)));
}

/** `getSolvedPairs` 결과 set에 (userId, problemId) 페어가 포함됐는지 검사 */
export function isSolvedPair(set: Set<string>, userId: number, problemId: number): boolean {
	return set.has(solvedPairKey(userId, problemId));
}
