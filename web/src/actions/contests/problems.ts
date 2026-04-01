"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as adminContestProblems from "@/lib/services/contest-problems";

export async function addProblemToContest(
	...args: Parameters<typeof adminContestProblems.addProblemToContest>
) {
	await requireAdmin();
	const result = await adminContestProblems.addProblemToContest(...args);
	const { contestId } = args[0];
	revalidatePath(`/contests/${contestId}`);
	revalidatePath(`/admin/contests/${contestId}`);
	return result;
}

export async function removeProblemFromContest(contestProblemId: number, contestId: number) {
	await requireAdmin();
	const result = await adminContestProblems.removeProblemFromContest(contestProblemId);
	revalidatePath(`/contests/${contestId}`);
	revalidatePath(`/admin/contests/${contestId}`);
	return result;
}

export async function reorderContestProblems(
	...args: Parameters<typeof adminContestProblems.reorderContestProblems>
) {
	await requireAdmin();
	const result = await adminContestProblems.reorderContestProblems(...args);
	const contestId = args[0];
	revalidatePath(`/contests/${contestId}`);
	revalidatePath(`/admin/contests/${contestId}`);
	return result;
}
