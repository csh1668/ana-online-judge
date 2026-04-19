"use server";

import { revalidatePath } from "next/cache";
import { getSessionInfo, requireAuth } from "@/lib/auth-utils";
import { runNow } from "@/lib/queue/rating-queue";
import { MAX_TAGS_PER_VOTE, replaceUserVoteTags } from "@/lib/services/problem-vote-tags";
import { removeVote, upsertVote } from "@/lib/services/problem-votes";

export async function voteOnProblemAction(input: {
	problemId: number;
	level: number | null;
	comment?: string | null;
	tagIds: number[];
}): Promise<void> {
	if (input.tagIds.length > MAX_TAGS_PER_VOTE) {
		throw new Error(`태그는 최대 ${MAX_TAGS_PER_VOTE}개까지 선택할 수 있습니다.`);
	}

	const { userId } = await requireAuth();
	const { isAdmin } = await getSessionInfo();

	await upsertVote({
		userId,
		problemId: input.problemId,
		level: input.level,
		comment: input.comment ?? null,
		isAdmin,
	});
	await replaceUserVoteTags({
		userId,
		problemId: input.problemId,
		tagIds: input.tagIds,
	});
	await runNow({ kind: "recomputeProblemTier", problemId: input.problemId });
	await runNow({ kind: "recomputeProblemTags", problemId: input.problemId });
	revalidatePath(`/problems/${input.problemId}`);
}

export async function removeVoteAction(problemId: number): Promise<void> {
	const { userId } = await requireAuth();

	await removeVote(userId, problemId);
	await replaceUserVoteTags({ userId, problemId, tagIds: [] });
	await runNow({ kind: "recomputeProblemTier", problemId });
	await runNow({ kind: "recomputeProblemTags", problemId });
	revalidatePath(`/problems/${problemId}`);
}
