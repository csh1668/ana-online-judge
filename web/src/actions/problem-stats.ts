"use server";

import {
	getProblemRanking as getProblemRankingService,
	getProblemStats as getProblemStatsService,
} from "@/lib/services/problem-stats";

export async function getProblemStats(problemId: number, contestId?: number) {
	return getProblemStatsService(problemId, contestId);
}

export async function getProblemRanking(
	problemId: number,
	options?: {
		sortBy?: "executionTime" | "codeLength";
		language?: string;
		page?: number;
		limit?: number;
		contestId?: number;
	}
) {
	return getProblemRankingService(problemId, options);
}
