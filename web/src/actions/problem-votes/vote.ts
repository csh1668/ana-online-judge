"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-utils";
import { enqueue } from "@/lib/queue/rating-queue";
import { removeVote, upsertVote } from "@/lib/services/problem-votes";

export async function voteOnProblemAction(input: {
	problemId: number;
	level: number | null;
	comment?: string | null;
}): Promise<void> {
	const { userId } = await requireAuth();

	await upsertVote({
		userId,
		problemId: input.problemId,
		level: input.level,
		comment: input.comment ?? null,
	});
	enqueue({ kind: "recomputeProblemTier", problemId: input.problemId });
	revalidatePath(`/problems/${input.problemId}`);
}

export async function removeVoteAction(problemId: number): Promise<void> {
	const { userId } = await requireAuth();

	await removeVote(userId, problemId);
	enqueue({ kind: "recomputeProblemTier", problemId });
	revalidatePath(`/problems/${problemId}`);
}
