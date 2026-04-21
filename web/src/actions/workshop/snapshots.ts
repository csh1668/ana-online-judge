"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-snapshots";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export async function createWorkshopSnapshot(
	problemId: number,
	input: { label: string; message?: string | null }
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	// Ensure the draft exists before snapshotting — no-op if already present.
	await getActiveDraftForUser(problemId, userId, isAdmin);
	const snapshot = await svc.createSnapshot({
		problemId,
		userId,
		label: input.label,
		message: input.message ?? null,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/snapshots`);
	return snapshot;
}

export async function listWorkshopSnapshots(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	// Ensure caller is a member of the problem (admins bypass); `getActiveDraftForUser`
	// throws with "멤버가 아닙니다" otherwise.
	await getActiveDraftForUser(problemId, userId, isAdmin);
	const rows = await svc.listSnapshots(problemId);
	return { snapshots: rows };
}

export async function getWorkshopSnapshot(problemId: number, snapshotId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId, isAdmin);
	const snapshot = await svc.getSnapshot(problemId, snapshotId);
	if (!snapshot) throw new Error("스냅샷을 찾을 수 없습니다");
	return snapshot;
}

export async function rollbackWorkshopSnapshot(problemId: number, snapshotId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId, isAdmin);
	const result = await svc.rollbackToSnapshot({ problemId, userId, snapshotId });
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/snapshots`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	revalidatePath(`/workshop/${problemId}/resources`);
	revalidatePath(`/workshop/${problemId}/generators`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/checker`);
	revalidatePath(`/workshop/${problemId}/validator`);
	revalidatePath(`/workshop/${problemId}/statement`);
	return result;
}

export async function getStaleDraftInfo(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId, isAdmin);
	return svc.detectStaleDraft({ problemId, userId });
}

export async function updateDraftToLatestSnapshot(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId, isAdmin);
	const result = await svc.updateDraftToLatest({ problemId, userId });
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/snapshots`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	revalidatePath(`/workshop/${problemId}/resources`);
	revalidatePath(`/workshop/${problemId}/generators`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/checker`);
	revalidatePath(`/workshop/${problemId}/validator`);
	revalidatePath(`/workshop/${problemId}/statement`);
	return result;
}
