"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as sourcesService from "@/lib/services/sources";

function adminUserId(user: { id?: string }) {
	return user.id ? Number.parseInt(user.id, 10) : null;
}

export async function setProblemSourcesAction(problemId: number, sourceIds: number[]) {
	const user = await requireAdmin();
	await sourcesService.setProblemSources(problemId, sourceIds, adminUserId(user));
	revalidatePath(`/problems/${problemId}`);
	revalidatePath(`/admin/problems/${problemId}`);
	return { ok: true };
}

export async function addProblemsToSourceAction(sourceId: number, problemIds: number[]) {
	const user = await requireAdmin();
	const res = await sourcesService.addProblemsToSource(sourceId, problemIds, adminUserId(user));
	revalidatePath(`/sources/${sourceId}`);
	for (const pid of problemIds) revalidatePath(`/problems/${pid}`);
	return res;
}

export async function setContestSourceAction(contestId: number, sourceId: number | null) {
	const user = await requireAdmin();
	const { previousSourceId } = await sourcesService.setContestSource(
		contestId,
		sourceId,
		adminUserId(user)
	);
	revalidatePath(`/admin/contests/${contestId}`);
	if (sourceId !== null) revalidatePath(`/sources/${sourceId}`);
	if (previousSourceId !== null && previousSourceId !== sourceId) {
		revalidatePath(`/sources/${previousSourceId}`);
	}
	return { ok: true };
}

export async function createSourceAndAttachContestAction(
	contestId: number,
	input: Parameters<typeof sourcesService.createSourceAndAttachContest>[1]
) {
	const user = await requireAdmin();
	const row = await sourcesService.createSourceAndAttachContest(
		contestId,
		input,
		adminUserId(user)
	);
	revalidatePath(`/admin/contests/${contestId}`);
	revalidatePath("/admin/sources");
	revalidatePath("/sources");
	revalidatePath(`/sources/${row.id}`);
	return row;
}
