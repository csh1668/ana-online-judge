"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { contests, problems } from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";
import { getContestStatus } from "@/lib/contest-utils";
import { isContestOperator } from "@/lib/services/contest-operators";
import {
	getProblemRanking as getProblemRankingService,
	getProblemStats as getProblemStatsService,
	type ProblemRankingItem,
	type ProblemRanking as ProblemRankingServiceResult,
} from "@/lib/services/problem-stats";
import { augmentSubmissionsWithCodeAccess, type CodeAccessResult } from "@/lib/submission-access";

export type ProblemRankingItemWithAccess = ProblemRankingItem & {
	codeAccess: CodeAccessResult;
};

export type ProblemRankingResult = {
	rankings: ProblemRankingItemWithAccess[];
	total: ProblemRankingServiceResult["total"];
};

export async function getProblemStats(problemId: number, contestId?: number) {
	if (contestId === undefined) return getProblemStatsService(problemId);

	// 대회 진행 중 비운영진은 본인 제출만 집계한 통계를 본다
	const { userId, isAdmin } = await getSessionInfo();
	if (!isAdmin) {
		const [contest] = await db
			.select({ startTime: contests.startTime, endTime: contests.endTime })
			.from(contests)
			.where(eq(contests.id, contestId))
			.limit(1);
		const running = contest !== undefined && getContestStatus(contest) === "running";
		if (running && !(userId !== null && (await isContestOperator(contestId, userId)))) {
			if (userId === null) {
				return { totalSubmissions: 0, acceptedSubmissions: 0, acceptedUsers: 0, acceptRate: "0.0" };
			}
			return getProblemStatsService(problemId, contestId, userId);
		}
	}
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
): Promise<ProblemRankingResult> {
	// Derive useFullJudge server-side — never trust the client to set the
	// sort mode, otherwise the full-judge ranking (best_passed DESC) can be
	// swapped out by forging useFullJudge=false.
	const [problem] = await db
		.select({ useFullJudge: problems.useFullJudge })
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);
	const result = await getProblemRankingService(problemId, {
		...options,
		useFullJudge: problem?.useFullJudge ?? false,
	});

	const session = await auth();
	const viewerUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;
	const isAdmin = session?.user?.role === "admin";

	const augmented = await augmentSubmissionsWithCodeAccess(
		result.rankings.map((r) => ({
			id: r.id,
			problemId,
			userId: r.userId,
			verdict: "accepted" as const,
			contestId: r.contestId,
			visibility: r.visibility,
		})),
		{ viewerUserId, isAdmin }
	);

	const accessById = new Map(augmented.map((a) => [a.id, a.codeAccess]));
	return {
		rankings: result.rankings.map((r) => ({
			...r,
			codeAccess: accessById.get(r.id) ?? { allowed: false, reason: "private" },
		})),
		total: result.total,
	};
}
