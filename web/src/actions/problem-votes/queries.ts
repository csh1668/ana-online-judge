"use server";

import { getSessionInfo } from "@/lib/auth-utils";
import { VOTES_PAGE_SIZE } from "@/lib/constants/votes";
import {
	checkCanVote,
	countVotesForProblem,
	getMyVote,
	hasUserSolvedProblem,
	isProblemInActiveContest,
	listVotesForProblem,
	type MyVote,
	type ProblemVoteListItem,
	type VoteCheckResult,
} from "@/lib/services/problem-votes";

export interface ProblemVotePanelData {
	votes: ProblemVoteListItem[]; // 첫 페이지 결과
	totalVotes: number; // 의견 총 개수 (canViewVotes와 무관하게 노출)
	myVote: MyVote | null;
	canVote: VoteCheckResult;
	canViewVotes: boolean; // AC 받았거나 admin인 경우에만 의견 목록 본문 노출
	isLoggedIn: boolean;
}

export async function getProblemVotesData(problemId: number): Promise<ProblemVotePanelData> {
	const { userId, isAdmin } = await getSessionInfo();

	if (userId == null) {
		// 비로그인: hasSolved/canVote 검사 모두 스킵, 카운트만 노출
		const totalVotes = await countVotesForProblem(problemId);
		return {
			votes: [],
			totalVotes,
			myVote: null,
			canVote: { ok: false, reason: "not_solved" },
			canViewVotes: false,
			isLoggedIn: false,
		};
	}

	// 한 번에 병렬 조회: hasSolved, inActiveContest는 checkCanVote와 canViewVotes 모두에서 재사용
	const [hasSolved, inActiveContest, totalVotes, myVote] = await Promise.all([
		hasUserSolvedProblem(userId, problemId),
		isProblemInActiveContest(problemId),
		countVotesForProblem(problemId),
		getMyVote(userId, problemId),
	]);

	const canViewVotes = isAdmin || hasSolved;
	const canVote = await checkCanVote(userId, problemId, isAdmin, {
		hasSolved,
		inActiveContest,
	});

	const votes = canViewVotes
		? await listVotesForProblem(problemId, { limit: VOTES_PAGE_SIZE, offset: 0 })
		: [];

	return {
		votes,
		totalVotes,
		myVote,
		canVote,
		canViewVotes,
		isLoggedIn: true,
	};
}

/**
 * 의견 목록 페이지네이션용 액션. 페이지 변경 시 호출되어 해당 페이지 슬라이스만 반환.
 * 권한 검사: 비로그인 또는 AC 안 받음(admin 아님) → 빈 배열.
 *
 * 페이지 크기는 lib/services/problem-votes.ts의 VOTES_PAGE_SIZE 사용.
 */
export async function listProblemVotesPaged(
	problemId: number,
	page: number
): Promise<{ votes: ProblemVoteListItem[]; totalVotes: number }> {
	const { userId, isAdmin } = await getSessionInfo();
	const totalVotes = await countVotesForProblem(problemId);

	if (userId == null) return { votes: [], totalVotes };

	const canView = isAdmin || (await hasUserSolvedProblem(userId, problemId));
	if (!canView) return { votes: [], totalVotes };

	const safePage = Math.max(1, Math.floor(page));
	const offset = (safePage - 1) * VOTES_PAGE_SIZE;
	const votes = await listVotesForProblem(problemId, {
		limit: VOTES_PAGE_SIZE,
		offset,
	});
	return { votes, totalVotes };
}
