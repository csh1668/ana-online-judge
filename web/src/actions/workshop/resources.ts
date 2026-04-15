"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-resources";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export async function listWorkshopResources(problemId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const rows = await svc.listResourcesForDraft(draft.id);
	return { draftId: draft.id, resources: rows };
}

export async function uploadWorkshopResource(problemId: number, formData: FormData) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);

	const nameRaw = formData.get("name");
	const file = formData.get("file");
	if (typeof nameRaw !== "string" || !nameRaw.trim()) {
		throw new Error("파일명을 입력해주세요");
	}
	if (!(file instanceof File)) {
		throw new Error("파일을 선택해주세요");
	}
	const content = Buffer.from(await file.arrayBuffer());

	const created = await svc.uploadResource({
		problemId,
		userId,
		draftId: draft.id,
		name: nameRaw.trim(),
		content,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/resources`);
	return created;
}

export async function renameWorkshopResource(
	problemId: number,
	resourceId: number,
	newName: string
) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const updated = await svc.renameResource({
		problemId,
		userId,
		draftId: draft.id,
		resourceId,
		newName,
	});
	revalidatePath(`/workshop/${problemId}/resources`);
	return updated;
}

export async function deleteWorkshopResource(problemId: number, resourceId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	await svc.deleteResource(draft.id, resourceId);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/resources`);
}

export async function readWorkshopResourceText(problemId: number, resourceId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const { name, content } = await svc.readResourceContent(draft.id, resourceId);
	// Heuristic: treat as text if no null byte in the first 8KB, else refuse.
	const sample = content.subarray(0, 8192);
	const isText = !sample.includes(0);
	if (!isText) {
		return { name, text: null as string | null, binary: true as const };
	}
	return { name, text: content.toString("utf-8"), binary: false as const };
}
