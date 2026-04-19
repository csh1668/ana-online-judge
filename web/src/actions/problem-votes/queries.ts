"use server";

import { getSessionInfo } from "@/lib/auth-utils";
import {
	checkCanVote,
	getMyVote,
	listVotesForProblem,
	type MyVote,
	type ProblemVoteListItem,
	type VoteCheckResult,
} from "@/lib/services/problem-votes";

export interface ProblemVotePanelData {
	votes: ProblemVoteListItem[];
	myVote: MyVote | null;
	canVote: VoteCheckResult;
	isLoggedIn: boolean;
}

export async function getProblemVotesData(problemId: number): Promise<ProblemVotePanelData> {
	const { userId, isAdmin } = await getSessionInfo();

	const [votes, myVote, canVote] = await Promise.all([
		listVotesForProblem(problemId),
		userId ? getMyVote(userId, problemId) : Promise.resolve(null),
		userId
			? checkCanVote(userId, problemId, isAdmin)
			: Promise.resolve<VoteCheckResult>({ ok: false, reason: "not_solved" }),
	]);

	return {
		votes,
		myVote,
		canVote,
		isLoggedIn: userId !== null,
	};
}
