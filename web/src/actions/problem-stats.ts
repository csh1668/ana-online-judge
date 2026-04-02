"use server";

import {
	getProblemRanking as getProblemRankingService,
	getProblemStats as getProblemStatsService,
} from "@/lib/services/problem-stats";

export async function getProblemStats(problemId: number) {
	return getProblemStatsService(problemId);
}

export async function getProblemRanking(
	problemId: number,
	options?: {
		sortBy?: "executionTime" | "codeLength";
		language?: string;
		page?: number;
		limit?: number;
	}
) {
	return getProblemRankingService(problemId, options);
}
