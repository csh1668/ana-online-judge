import "server-only";

import { and, eq, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
	contestParticipants,
	contests,
	problems,
	type SubmissionVisibility,
	submissions,
	type Verdict,
} from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";
import { getContestStatus } from "@/lib/contest-utils";
import { hasUserSolvedProblem } from "@/lib/services/problem-votes";
import { getSolvedPairs, isSolvedPair } from "@/lib/services/solved-clause";

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
 *
 * NOTE: API 라우트 전용 (NextResponse 반환). 다른 곳에서는 `decideAccess` 사용.
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

export type AccessRow = {
	userId: number;
	problemId: number;
	contestId: number | null;
	visibility: SubmissionVisibility;
	verdict: Verdict;
};

export type AccessViewer = {
	viewerUserId: number | null;
	isAdmin: boolean;
};

export type AccessPrecomputed = {
	/** 대회 상태: "running" 또는 "ended" (대회 제출일 때만 의미). */
	contestStatus: "running" | "ended" | null;
	/** 제출자가 canonical 기준으로 이 문제를 풀었는지 (public_on_ac 판정용). */
	submitterSolved: boolean;
	/** viewer가 canonical 기준으로 이 문제를 풀었는지 (not_solved 판정용). */
	viewerSolved: boolean;
};

/**
 * 가시성 매트릭스 단일 결정 함수. 외부에서 미리 계산한 값(`AccessPrecomputed`)을
 * 받아 동기적으로 결과를 반환한다. 상세/목록 두 진입점이 동일한 매트릭스를 공유하도록
 * 한 곳에 모아둔 형태.
 */
export function decideAccess(
	row: AccessRow,
	viewer: AccessViewer,
	precomputed: AccessPrecomputed
): CodeAccessResult {
	if (viewer.isAdmin) return { allowed: true };
	if (viewer.viewerUserId !== null && viewer.viewerUserId === row.userId) {
		return { allowed: true };
	}

	if (row.contestId !== null) {
		if (precomputed.contestStatus === "running") {
			return { allowed: false, reason: "contest_running" };
		}
		return { allowed: false, reason: "contest_submission" };
	}

	if (viewer.viewerUserId === null) return { allowed: false, reason: "anonymous" };

	if (row.visibility === "private") return { allowed: false, reason: "private" };

	if (row.visibility === "public_on_ac") {
		if (row.verdict === "pending" || row.verdict === "judging") {
			return { allowed: false, reason: "judging" };
		}
		if (!precomputed.submitterSolved) return { allowed: false, reason: "not_yet_ac" };
	}

	if (!precomputed.viewerSolved) return { allowed: false, reason: "not_solved" };

	return { allowed: true };
}

/**
 * 단일 제출 상세 페이지 / 다운로드 API 의 코드 가시성 판정.
 * 내부에서 contest 상태와 solved 여부를 조회한 뒤 `decideAccess`로 판정한다.
 */
export async function checkSubmissionCodeAccess(params: {
	submission: AccessRow;
	viewerUserId: number | null;
	isAdmin: boolean;
}): Promise<CodeAccessResult> {
	const { submission, viewerUserId, isAdmin } = params;

	if (isAdmin) return { allowed: true };
	if (viewerUserId !== null && viewerUserId === submission.userId) return { allowed: true };

	let contestStatus: "running" | "ended" | null = null;
	if (submission.contestId !== null) {
		const [contest] = await db
			.select({ startTime: contests.startTime, endTime: contests.endTime })
			.from(contests)
			.where(eq(contests.id, submission.contestId))
			.limit(1);
		if (contest) {
			contestStatus = getContestStatus(contest) === "running" ? "running" : "ended";
		} else {
			contestStatus = "ended";
		}
	}

	const isPublicOnAc = submission.visibility === "public_on_ac";
	const judging = submission.verdict === "pending" || submission.verdict === "judging";
	const submitterSolved =
		isPublicOnAc && !judging
			? await hasUserSolvedProblem(submission.userId, submission.problemId)
			: false;

	const viewerSolved =
		viewerUserId !== null ? await hasUserSolvedProblem(viewerUserId, submission.problemId) : false;

	return decideAccess(
		submission,
		{ viewerUserId, isAdmin },
		{ contestStatus, submitterSolved, viewerSolved }
	);
}

// ============================================================
// List 가시성 (서비스 외부에서 컴포지션할 수 있도록 빌더 형태로 제공)
// ============================================================

/**
 * 비-admin viewer를 묘사하는 list 필터 스코프. action/route 가 세션에서 변환해 만든다.
 */
export type ListVisibilityViewer = {
	viewerUserId: number | null;
	accessibleContestIds: number[];
	excludeContestSubmissions: boolean;
};

/**
 * Viewer 가 참여 중/종료된 대회 contest_id 목록 조회.
 * action/route 단에서 호출해 `buildSubmissionListVisibilityWhere`에 넘긴다.
 */
export async function getAccessibleContestIds(viewerUserId: number): Promise<number[]> {
	const rows = await db
		.select({ contestId: contestParticipants.contestId })
		.from(contestParticipants)
		.where(eq(contestParticipants.userId, viewerUserId));
	return rows.map((r) => r.contestId);
}

/**
 * `getSubmissions` 서비스에 주입할 visibility WHERE 절을 빌드한다.
 * admin이면 호출하지 않는다(스코프가 "all"임을 액션에서 표현).
 *
 * 빌드되는 조건은 `submissions`/`problems` 테이블에 의존하므로, 호출 측 쿼리가
 * 두 테이블을 조인하고 있어야 한다 (현행 `getSubmissions`은 그렇게 구성됨).
 */
export function buildSubmissionListVisibilityWhere(viewer: ListVisibilityViewer): SQL | undefined {
	const { viewerUserId, accessibleContestIds, excludeContestSubmissions } = viewer;

	if (excludeContestSubmissions) {
		const publicNonContest = and(isNull(submissions.contestId), eq(problems.isPublic, true));
		if (viewerUserId !== null) {
			return or(eq(submissions.userId, viewerUserId), publicNonContest);
		}
		return publicNonContest;
	}

	if (viewerUserId !== null) {
		const conds: SQL[] = [
			eq(submissions.userId, viewerUserId),
			and(isNull(submissions.contestId), eq(problems.isPublic, true))!,
		];
		if (accessibleContestIds.length > 0) {
			conds.push(
				and(isNotNull(submissions.contestId), inArray(submissions.contestId, accessibleContestIds))!
			);
		}
		return or(...conds);
	}

	return and(isNull(submissions.contestId), eq(problems.isPublic, true));
}

export type ListAccessRow = {
	id: number;
	problemId: number;
	userId: number;
	verdict: Verdict;
	contestId: number | null;
	visibility: SubmissionVisibility;
};

/**
 * 제출 목록 row 들에 `codeAccess` 필드를 붙인다.
 * 대회 상태, viewer-solved, submitter-solved를 한 번씩 배치 조회한 뒤 row 별로 `decideAccess` 적용.
 */
export async function augmentSubmissionsWithCodeAccess<T extends ListAccessRow>(
	rows: T[],
	viewer: AccessViewer
): Promise<(T & { codeAccess: CodeAccessResult })[]> {
	if (rows.length === 0) return [];

	if (viewer.isAdmin) {
		return rows.map((r) => ({ ...r, codeAccess: { allowed: true } as CodeAccessResult }));
	}

	const { viewerUserId } = viewer;

	const contestIds = Array.from(
		new Set(rows.map((r) => r.contestId).filter((id): id is number => id !== null))
	);
	const contestStatusMap = new Map<number, "running" | "ended">();
	if (contestIds.length > 0) {
		const contestRows = await db
			.select({ id: contests.id, startTime: contests.startTime, endTime: contests.endTime })
			.from(contests)
			.where(inArray(contests.id, contestIds));
		for (const c of contestRows) {
			const status = getContestStatus({ startTime: c.startTime, endTime: c.endTime });
			contestStatusMap.set(c.id, status === "running" ? "running" : "ended");
		}
	}

	const viewerSolvedPairs =
		viewerUserId !== null
			? Array.from(
					new Set(
						rows
							.filter((r) => r.userId !== viewerUserId && r.contestId === null)
							.map((r) => r.problemId)
					)
				).map((problemId) => ({ userId: viewerUserId, problemId }))
			: [];
	const viewerSolvedSet = await getSolvedPairs(viewerSolvedPairs);

	const submitterPairs = rows
		.filter(
			(r) =>
				r.contestId === null &&
				r.visibility === "public_on_ac" &&
				r.verdict !== "pending" &&
				r.verdict !== "judging" &&
				r.userId !== viewerUserId
		)
		.map((r) => ({ userId: r.userId, problemId: r.problemId }));
	const submitterSolvedSet = await getSolvedPairs(submitterPairs);

	return rows.map((r) => {
		const access = decideAccess(r, viewer, {
			contestStatus: r.contestId !== null ? (contestStatusMap.get(r.contestId) ?? "ended") : null,
			submitterSolved: isSolvedPair(submitterSolvedSet, r.userId, r.problemId),
			viewerSolved:
				viewerUserId !== null ? isSolvedPair(viewerSolvedSet, viewerUserId, r.problemId) : false,
		});
		return { ...r, codeAccess: access };
	});
}
