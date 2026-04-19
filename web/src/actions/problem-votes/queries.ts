"use server";

import { getSessionInfo } from "@/lib/auth-utils";
import {
	checkCanVote,
	countVotesForProblem,
	getMyVote,
	hasUserSolvedProblem,
	listVotesForProblem,
	type MyVote,
	type ProblemVoteListItem,
	type VoteCheckResult,
} from "@/lib/services/problem-votes";

export interface ProblemVotePanelData {
	votes: ProblemVoteListItem[];
	totalVotes: number; // 의견 총 개수 (canViewVotes와 무관하게 노출)
	myVote: MyVote | null;
	canVote: VoteCheckResult;
	canViewVotes: boolean; // AC 받았거나 admin인 경우에만 의견 목록 본문 노출
	isLoggedIn: boolean;
}

export async function getProblemVotesData(problemId: number): Promise<ProblemVotePanelData> {
	const { userId, isAdmin } = await getSessionInfo();

	// 의견 목록 조회 권한: admin OR 본인이 AC. 그 외에는 votes를 빈 배열로 반환해 누출 방지.
	const canViewVotes =
		userId != null && (isAdmin || (await hasUserSolvedProblem(userId, problemId)));

	const [votes, totalVotes, myVote, canVote] = await Promise.all([
		canViewVotes ? listVotesForProblem(problemId) : Promise.resolve([]),
		countVotesForProblem(problemId),
		userId ? getMyVote(userId, problemId) : Promise.resolve(null),
		userId
			? checkCanVote(userId, problemId, isAdmin)
			: Promise.resolve<VoteCheckResult>({ ok: false, reason: "not_solved" }),
	]);

	return {
		votes,
		totalVotes,
		myVote,
		canVote,
		canViewVotes,
		isLoggedIn: userId !== null,
	};
}
