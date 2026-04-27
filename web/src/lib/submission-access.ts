import "server-only";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contests, type ProblemType, type SubmissionVisibility, type Verdict } from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";
import { getContestStatus } from "@/lib/contest-utils";
import { hasUserSolvedProblem } from "@/lib/services/problem-votes";

export type CodeAccessDeniedReason =
	| "contest_running"
	| "contest_submission"
	| "anonymous"
	| "not_solved"
	| "private"
	| "not_yet_ac"
	| "judging";

export type CodeAccessResult =
	| { allowed: true }
	| { allowed: false; reason: CodeAccessDeniedReason };

/**
 * 대회 진행 중인 제출에 대한 접근 권한을 확인한다.
 * - 비대회 제출: 접근 허용 (null 반환)
 * - 대회 종료 후: 접근 허용 (null 반환)
 * - 대회 진행 중: 본인 또는 관리자만 접근 허용, 그 외 403 반환
 */
export async function checkContestSubmissionAccess(submission: {
	userId: number;
	contestId: number | null;
}): Promise<NextResponse | null> {
	if (!submission.contestId) return null;

	const [contest] = await db
		.select({ startTime: contests.startTime, endTime: contests.endTime })
		.from(contests)
		.where(eq(contests.id, submission.contestId))
		.limit(1);

	if (!contest) return null;

	const status = getContestStatus(contest);
	if (status !== "running") return null;

	const { userId, isAdmin } = await getSessionInfo();
	if (isAdmin || userId === submission.userId) return null;

	return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * 제출 row 단위 "풀이 인정" 판정.
 * - 일반 문제: submission.score == problem.maxScore
 * - Anigma: 제출 row 만으로는 판정 불가 → 제출자가 그 문제를 canonical 기준으로 풀었는가
 *   (제출자 풀음은 hasUserSolvedProblem 으로 확인)
 */
export async function isSubmissionAccepted(submission: {
	userId: number;
	problemId: number;
	score: number | null;
	verdict: Verdict;
	problemType: ProblemType;
	maxScore: number;
}): Promise<boolean> {
	if (submission.problemType === "anigma") {
		return hasUserSolvedProblem(submission.userId, submission.problemId);
	}
	if (submission.verdict === "pending" || submission.verdict === "judging") return false;
	return (submission.score ?? 0) === submission.maxScore;
}

/**
 * 제출 상세 페이지 / 다운로드 API 의 코드 가시성 판정.
 * 매트릭스는 spec §4.1 참고.
 */
export async function checkSubmissionCodeAccess(params: {
	submission: {
		userId: number;
		problemId: number;
		contestId: number | null;
		visibility: SubmissionVisibility;
		verdict: Verdict;
		score: number | null;
	};
	problem: { problemType: ProblemType; maxScore: number };
	viewerUserId: number | null;
	isAdmin: boolean;
}): Promise<CodeAccessResult> {
	const { submission, problem, viewerUserId, isAdmin } = params;

	if (isAdmin) return { allowed: true };
	if (viewerUserId !== null && viewerUserId === submission.userId) return { allowed: true };

	if (submission.contestId) {
		const [contest] = await db
			.select({ startTime: contests.startTime, endTime: contests.endTime })
			.from(contests)
			.where(eq(contests.id, submission.contestId))
			.limit(1);
		if (contest && getContestStatus(contest) === "running") {
			return { allowed: false, reason: "contest_running" };
		}
		return { allowed: false, reason: "contest_submission" };
	}

	if (viewerUserId === null) return { allowed: false, reason: "anonymous" };

	if (submission.visibility === "private") return { allowed: false, reason: "private" };

	if (submission.visibility === "public_on_ac") {
		if (submission.verdict === "pending" || submission.verdict === "judging") {
			return { allowed: false, reason: "judging" };
		}
		const accepted = await isSubmissionAccepted({
			userId: submission.userId,
			problemId: submission.problemId,
			score: submission.score,
			verdict: submission.verdict,
			problemType: problem.problemType,
			maxScore: problem.maxScore,
		});
		if (!accepted) return { allowed: false, reason: "not_yet_ac" };
	}

	const solved = await hasUserSolvedProblem(viewerUserId, submission.problemId);
	if (!solved) return { allowed: false, reason: "not_solved" };

	return { allowed: true };
}
