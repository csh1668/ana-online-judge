import { and, count, countDistinct, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type SubmissionVisibility, submissions } from "@/db/schema";
import type { Language } from "@/lib/languages";
import { ANIGMA_SOLVED_THRESHOLD } from "@/lib/services/solved-clause";

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
	bestPassed?: number | null;
	contestId: number | null;
	visibility: SubmissionVisibility;
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

	const contestFilter = contestId ? sql`AND s.contest_id = ${contestId}` : sql``;

	// 정답 비율: "최초 AC까지의 제출만" 분모에 카운트
	const acceptRateQuery = db.execute<{ solved_users: number; effective_submissions: number }>(sql`
		SELECT
			COUNT(DISTINCT ranked.user_id) FILTER (WHERE ranked.first_ac_id IS NOT NULL)::int
				AS solved_users,
			COUNT(*) FILTER (WHERE ranked.first_ac_id IS NULL OR ranked.id <= ranked.first_ac_id)::int
				AS effective_submissions
		FROM (
			SELECT
				s.user_id, s.id,
				MIN(s.id) FILTER (WHERE s.verdict = 'accepted')
					OVER (PARTITION BY s.user_id) AS first_ac_id
			FROM submissions s
			WHERE s.problem_id = ${problemId}
			  ${contestFilter}
		) ranked
	`);

	// 맞힌 사람 수는 canonical 정의로 계산:
	// 일반 문제: MAX(score) = p.max_score / Anigma: Task1+Task2 ≥ 70
	const acceptedUsersQuery = db.execute<{ cnt: number }>(sql`
		SELECT COUNT(*)::int AS cnt FROM (
			SELECT s.user_id
			FROM submissions s
			INNER JOIN problems p ON p.id = s.problem_id
			WHERE s.problem_id = ${problemId}
			  ${contestFilter}
			GROUP BY s.user_id, p.problem_type, p.max_score
			HAVING
				(p.problem_type != 'anigma' AND MAX(s.score) = p.max_score)
				OR
				(p.problem_type = 'anigma'
					AND COALESCE(MAX(CASE WHEN s.anigma_task_type = 1 THEN s.score END), 0)
					  + COALESCE(MAX(CASE WHEN s.anigma_task_type = 2 THEN s.score END), 0)
					  >= ${ANIGMA_SOLVED_THRESHOLD})
		) solvers
	`);

	const [totalResult, acceptedResult, acceptedUsersResult, acceptRateResult] = await Promise.all([
		db.select({ count: count() }).from(submissions).where(baseConditions),
		db.select({ count: count() }).from(submissions).where(acceptedConditions),
		acceptedUsersQuery,
		acceptRateQuery,
	]);

	const totalSubmissions = totalResult[0].count;
	const acceptedSubmissions = acceptedResult[0].count;
	const acceptedUsers = (acceptedUsersResult as unknown as { cnt: number }[])[0]?.cnt ?? 0;

	const acceptRateRow = (
		acceptRateResult as unknown as { solved_users: number; effective_submissions: number }[]
	)[0];
	const solvedUsers = Number(acceptRateRow?.solved_users ?? 0);
	const effectiveSubmissions = Number(acceptRateRow?.effective_submissions ?? 0);
	const acceptRate =
		effectiveSubmissions > 0 ? ((solvedUsers / effectiveSubmissions) * 100).toFixed(1) : "0.0";

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
		useFullJudge?: boolean;
	}
): Promise<ProblemRanking> {
	const sortBy = options?.sortBy ?? "executionTime";
	const language = options?.language;
	const contestId = options?.contestId;
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const useFullJudge = options?.useFullJudge ?? false;

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

	// Full-judge problems: order solvers by BEST passedTestcases DESC across ALL submissions
	// (not just accepted ones), with first-AC time as tiebreaker. Only AC users are listed.
	if (useFullJudge) {
		const fullJudgeResult = await db.execute<{
			id: number;
			userId: number;
			userName: string;
			language: Language;
			executionTime: number | null;
			memoryUsed: number | null;
			codeLength: number | null;
			createdAt: Date;
			bestPassed: number | null;
			contestId: number | null;
			visibility: SubmissionVisibility;
		}>(sql`
			SELECT
				best_ac.id,
				best_ac."userId",
				best_ac."userName",
				best_ac.language,
				best_ac."executionTime",
				best_ac."memoryUsed",
				best_ac."codeLength",
				best_ac."createdAt",
				best_ac."contestId",
				best_ac."visibility",
				per_user.best_passed AS "bestPassed"
			FROM (
				SELECT
					s.user_id,
					MAX(COALESCE(s.passed_testcases, 0)) AS best_passed,
					MIN(s.created_at) FILTER (WHERE s.verdict = 'accepted') AS first_ac_time
				FROM submissions s
				WHERE s.problem_id = ${problemId}
					${languageFilter}
					${contestFilter}
				GROUP BY s.user_id
				HAVING BOOL_OR(s.verdict = 'accepted')
			) per_user
			INNER JOIN LATERAL (
				SELECT DISTINCT ON (s2.user_id)
					s2.id,
					s2.user_id AS "userId",
					u.name AS "userName",
					s2.language,
					s2.execution_time AS "executionTime",
					s2.memory_used AS "memoryUsed",
					s2.code_length AS "codeLength",
					s2.created_at AS "createdAt",
					s2.contest_id AS "contestId",
					s2.visibility AS "visibility"
				FROM submissions s2
				INNER JOIN users u ON s2.user_id = u.id
				WHERE s2.user_id = per_user.user_id
					AND s2.problem_id = ${problemId}
					AND s2.verdict = 'accepted'
					${languageFilter}
					${contestFilter}
				ORDER BY s2.user_id, s2.execution_time ASC NULLS LAST, s2.memory_used ASC NULLS LAST
				LIMIT 1
			) best_ac ON TRUE
			ORDER BY per_user.best_passed DESC, per_user.first_ac_time ASC
			LIMIT ${limit} OFFSET ${offset}
		`);

		return {
			rankings: fullJudgeResult as unknown as ProblemRankingItem[],
			total,
		};
	}

	// Tiebreaker: when sorting by execution_time, ties are broken by memory_used ASC.
	// When sorting by code_length, ties are broken by execution_time ASC for stability.
	const innerOrderBy =
		sortBy === "executionTime"
			? sql`s.execution_time ASC NULLS LAST, s.memory_used ASC NULLS LAST`
			: sql`s.code_length ASC NULLS LAST, s.execution_time ASC NULLS LAST`;
	const outerOrderBy =
		sortBy === "executionTime"
			? sql`sub."executionTime" ASC NULLS LAST, sub."memoryUsed" ASC NULLS LAST`
			: sql`sub."codeLength" ASC NULLS LAST, sub."executionTime" ASC NULLS LAST`;

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
		contestId: number | null;
		visibility: SubmissionVisibility;
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
				s.created_at AS "createdAt",
				s.contest_id AS "contestId",
				s.visibility AS "visibility"
			FROM submissions s
			INNER JOIN users u ON s.user_id = u.id
			WHERE s.problem_id = ${problemId}
				AND s.verdict = 'accepted'
				${languageFilter}
				${contestFilter}
			ORDER BY s.user_id, ${innerOrderBy}
		) sub
		ORDER BY ${outerOrderBy}
		LIMIT ${limit} OFFSET ${offset}
	`);

	return {
		rankings: result as unknown as ProblemRankingItem[],
		total,
	};
}
