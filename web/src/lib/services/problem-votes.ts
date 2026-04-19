import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { problems, problemVotes, users } from "@/db/schema";
import { VOTES_PAGE_SIZE } from "@/lib/constants/votes";
import { userSolvedProblemSql } from "./solved-clause";

export type VoteCheckResult =
	| { ok: true }
	| { ok: false; reason: "not_solved" | "in_active_contest" | "problem_not_found" };

/**
 * 해당 사용자가 이 문제를 "푼 문제"로 인정받는지 확인한다.
 * 정의는 userSolvedProblemSql 참고:
 *  - 일반 문제: 어떤 제출이 score = max_score
 *  - Anigma: Task1 max + Task2 max ≥ 70 (edit_distance는 보너스 영역으로 무관)
 */
export async function hasUserSolvedProblem(userId: number, problemId: number): Promise<boolean> {
	const rows = await db.execute<{ ok: boolean }>(sql`
		SELECT ${userSolvedProblemSql(userId)} AS ok
		FROM problems p
		WHERE p.id = ${problemId}
	`);
	return rows[0]?.ok === true;
}

/** 문제가 현재 진행 중인 컨테스트(들 중 하나)에 포함돼 있는지 */
export async function isProblemInActiveContest(problemId: number): Promise<boolean> {
	const rows = await db.execute<{ id: number }>(sql`
		SELECT c.id FROM contests c
		JOIN contest_problems cp ON cp.contest_id = c.id
		WHERE cp.problem_id = ${problemId}
		  AND c.start_time <= NOW()
		  AND c.end_time >= NOW()
		LIMIT 1
	`);
	return rows.length > 0;
}

/**
 * 사용자가 해당 문제에 투표할 수 있는지 검증한다.
 * - 문제 AC 경험 필수. admin은 AC 면제.
 * - 그 문제가 **현재 진행 중인** 컨테스트에 포함되어 있으면 차단 (admin도 동일).
 * - 컨테스트 종료 후엔 자유.
 *
 * 이미 hasSolved/inActiveContest를 외부에서 계산했다면 precomputed로 전달해 중복 쿼리 회피 가능.
 */
export async function checkCanVote(
	userId: number,
	problemId: number,
	isAdmin = false,
	precomputed?: { hasSolved?: boolean; inActiveContest?: boolean }
): Promise<VoteCheckResult> {
	const [problem] = await db
		.select({ id: problems.id })
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);
	if (!problem) return { ok: false, reason: "problem_not_found" };

	const inActiveContest =
		precomputed?.inActiveContest ?? (await isProblemInActiveContest(problemId));
	if (inActiveContest) return { ok: false, reason: "in_active_contest" };

	if (isAdmin) return { ok: true };
	const hasSolved = precomputed?.hasSolved ?? (await hasUserSolvedProblem(userId, problemId));
	if (!hasSolved) return { ok: false, reason: "not_solved" };
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
	tags: { id: number; name: string }[];
}

/** 문제별 의견 총 개수 (내용 노출 없이 카운트만) */
export async function countVotesForProblem(problemId: number): Promise<number> {
	const rows = await db.execute<{ cnt: number }>(
		sql`SELECT COUNT(*)::int AS cnt FROM problem_votes WHERE problem_id = ${problemId}`
	);
	return rows[0]?.cnt ?? 0;
}

export async function listVotesForProblem(
	problemId: number,
	options: { limit?: number; offset?: number } = {}
): Promise<ProblemVoteListItem[]> {
	const limit = options.limit ?? VOTES_PAGE_SIZE;
	const offset = options.offset ?? 0;
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
		.orderBy(desc(problemVotes.updatedAt))
		.limit(limit)
		.offset(offset);

	if (rows.length === 0) return [];

	// 현재 페이지 voter들의 태그 일괄 조회 (ancestor 자동 추가분 포함 모두 표시).
	const voterIds = rows.map((r) => r.userId);
	const tagRows = await db.execute<{ user_id: number; tag_id: number; tag_name: string }>(sql`
		SELECT pvt.user_id, pvt.tag_id, t.name AS tag_name
		FROM problem_vote_tags pvt
		JOIN algorithm_tags t ON t.id = pvt.tag_id
		WHERE pvt.problem_id = ${problemId}
		  AND pvt.user_id = ANY(${voterIds})
		ORDER BY t.name ASC
	`);
	const tagsByUser = new Map<number, { id: number; name: string }[]>();
	for (const t of tagRows) {
		const arr = tagsByUser.get(t.user_id) ?? [];
		arr.push({ id: t.tag_id, name: t.tag_name });
		tagsByUser.set(t.user_id, arr);
	}

	return rows.map((r) => ({
		...r,
		rating: r.rating ?? 0,
		tags: tagsByUser.get(r.userId) ?? [],
	}));
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
