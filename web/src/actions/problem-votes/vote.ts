"use server";

import { revalidatePath } from "next/cache";
import { getSessionInfo, requireAuth } from "@/lib/auth-utils";
import { runNow } from "@/lib/queue/rating-queue";
import { removeVote, upsertVote } from "@/lib/services/problem-votes";

export async function voteOnProblemAction(input: {
	problemId: number;
	level: number | null;
	comment?: string | null;
}): Promise<void> {
	const { userId } = await requireAuth();
	const { isAdmin } = await getSessionInfo();

	await upsertVote({
		userId,
		problemId: input.problemId,
		level: input.level,
		comment: input.comment ?? null,
		isAdmin,
	});
	await runNow({ kind: "recomputeProblemTier", problemId: input.problemId });
	revalidatePath(`/problems/${input.problemId}`);
}

export async function removeVoteAction(problemId: number): Promise<void> {
	const { userId } = await requireAuth();

	await removeVote(userId, problemId);
	await runNow({ kind: "recomputeProblemTier", problemId });
	revalidatePath(`/problems/${problemId}`);
}
