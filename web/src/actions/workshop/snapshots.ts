"use server";

import { revalidatePath } from "next/cache";
import * as diffSvc from "@/lib/services/workshop-snapshot-diff";
import * as svc from "@/lib/services/workshop-snapshots";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export type CreateWorkshopSnapshotResult =
	| { ok: true; snapshot: Awaited<ReturnType<typeof svc.createSnapshot>> }
	| { ok: false; stale: true; message: string };

export async function createWorkshopSnapshot(
	problemId: number,
	input: { label: string; message?: string | null; force?: boolean }
): Promise<CreateWorkshopSnapshotResult> {
	const { userId, isAdmin } = await requireWorkshopAccess();
	if (input.label.trim().startsWith("auto/")) {
		throw new Error("auto/ 접두사는 시스템 예약이라 사용할 수 없습니다");
	}
	// Ensure the draft exists before snapshotting — no-op if already present.
	await getActiveDraftForUser(problemId, userId, isAdmin);
	let snapshot: Awaited<ReturnType<typeof svc.createSnapshot>>;
	try {
		snapshot = await svc.createSnapshot({
			problemId,
			userId,
			label: input.label,
			message: input.message ?? null,
			force: input.force ?? false,
		});
	} catch (err) {
		// Prod Next.js may redact server action error messages, so this flow
		// can't rely on the client matching on `err.message`. Catch the
		// service's stale rejection here and surface it as a typed result
		// instead — guarantees the force-commit UI works in prod. Other
		// errors are rethrown as-is (unredacted messages aren't load-bearing
		// for them).
		if (err instanceof Error && err.message.startsWith(svc.SNAPSHOT_STALE_MESSAGE_PREFIX)) {
			return { ok: false, stale: true, message: err.message };
		}
		throw err;
	}
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/snapshots`);
	return { ok: true, snapshot };
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

export async function getWorkshopSnapshotDiff(problemId: number, fromId: number, toId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId, isAdmin);
	return diffSvc.diffSnapshots(problemId, fromId, toId);
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
