"use server";

import { requireAdmin } from "@/lib/auth-utils";
import { enqueue } from "@/lib/queue/rating-queue";
import { listProblemIdsWithVotes } from "@/lib/services/problem-tier";
import { listAllUserIds } from "@/lib/services/user-rating";

export async function recomputeAllUserRatingsAction(): Promise<{ count: number }> {
	await requireAdmin();
	const ids = await listAllUserIds();
	for (const userId of ids) {
		enqueue({ kind: "recomputeUserRating", userId });
	}
	return { count: ids.length };
}

/**
 * 의견이 1개 이상 있는 모든 문제의 티어를 재계산 큐에 넣는다.
 * 프로세스 재시작으로 큐 잡이 유실됐을 때의 복원 액션.
 * 티어가 실제로 바뀐 문제는 큐 워커가 자동으로 영향 사용자들의 레이팅까지 fan-out.
 */
export async function recomputeAllProblemTiersAction(): Promise<{ count: number }> {
	await requireAdmin();
	const ids = await listProblemIdsWithVotes();
	for (const problemId of ids) {
		enqueue({ kind: "recomputeProblemTier", problemId });
	}
	return { count: ids.length };
}
