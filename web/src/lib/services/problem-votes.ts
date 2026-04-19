import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { problems, problemVotes, users } from "@/db/schema";

export type VoteCheckResult =
	| { ok: true }
	| { ok: false; reason: "not_solved" | "in_active_contest" | "problem_not_found" };

/**
 * 사용자가 해당 문제에 투표할 수 있는지 검증한다.
 * - 문제 AC 경험 필수 (score = max_score AND COALESCE(edit_distance,0)=0). admin은 AC 면제.
 * - 그 문제가 **현재 진행 중인** 컨테스트에 포함되어 있으면 차단 (admin도 동일 — 대회 중 티어 변동 차단 정책).
 * - 컨테스트 종료 후엔 자유.
 */
export async function checkCanVote(
	userId: number,
	problemId: number,
	isAdmin = false
): Promise<VoteCheckResult> {
	const [problem] = await db
		.select({ id: problems.id })
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);
	if (!problem) return { ok: false, reason: "problem_not_found" };

	// 진행 중인 컨테스트에 속한 문제면 차단
	const activeContest = await db.execute<{ id: number }>(sql`
		SELECT c.id FROM contests c
		JOIN contest_problems cp ON cp.contest_id = c.id
		WHERE cp.problem_id = ${problemId}
		  AND c.start_time <= NOW()
		  AND c.end_time >= NOW()
		LIMIT 1
	`);
	if (activeContest.length > 0) return { ok: false, reason: "in_active_contest" };

	// AC 조건 확인 (admin 면제)
	if (isAdmin) return { ok: true };

	const solved = await db.execute<{ cnt: number }>(sql`
		SELECT COUNT(*)::int AS cnt FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.user_id = ${userId}
		  AND s.problem_id = ${problemId}
		  AND s.score = p.max_score
		  AND COALESCE(s.edit_distance, 0) = 0
	`);
	if ((solved[0]?.cnt ?? 0) === 0) return { ok: false, reason: "not_solved" };

	return { ok: true };
}

export async function upsertVote(input: {
	userId: number;
	problemId: number;
	level: number | null;
	comment: string | null;
	isAdmin?: boolean;
}): Promise<void> {
	const { userId, problemId, level, comment, isAdmin = false } = input;
	if (level !== null && (level < 1 || level > 30 || !Number.isInteger(level))) {
		throw new Error("Invalid level");
	}
	const check = await checkCanVote(userId, problemId, isAdmin);
	if (!check.ok) throw new Error(`Cannot vote: ${check.reason}`);

	await db
		.insert(problemVotes)
		.values({ userId, problemId, level, comment })
		.onConflictDoUpdate({
			target: [problemVotes.problemId, problemVotes.userId],
			set: { level, comment, updatedAt: new Date() },
		});
}

export async function removeVote(userId: number, problemId: number): Promise<void> {
	await db
		.delete(problemVotes)
		.where(and(eq(problemVotes.userId, userId), eq(problemVotes.problemId, problemId)));
}

export interface ProblemVoteListItem {
	userId: number;
	username: string;
	name: string;
	rating: number;
	level: number | null;
	comment: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export async function listVotesForProblem(problemId: number): Promise<ProblemVoteListItem[]> {
	const rows = await db
		.select({
			userId: problemVotes.userId,
			username: users.username,
			name: users.name,
			rating: users.rating,
			level: problemVotes.level,
			comment: problemVotes.comment,
			createdAt: problemVotes.createdAt,
			updatedAt: problemVotes.updatedAt,
		})
		.from(problemVotes)
		.innerJoin(users, eq(users.id, problemVotes.userId))
		.where(eq(problemVotes.problemId, problemId))
		.orderBy(desc(problemVotes.updatedAt));
	return rows.map((r) => ({ ...r, rating: r.rating ?? 0 }));
}

export interface MyVote {
	level: number | null;
	comment: string | null;
	updatedAt: Date;
}

export async function getMyVote(userId: number, problemId: number): Promise<MyVote | null> {
	const [row] = await db
		.select({
			level: problemVotes.level,
			comment: problemVotes.comment,
			updatedAt: problemVotes.updatedAt,
		})
		.from(problemVotes)
		.where(and(eq(problemVotes.userId, userId), eq(problemVotes.problemId, problemId)))
		.limit(1);
	return row ?? null;
}
