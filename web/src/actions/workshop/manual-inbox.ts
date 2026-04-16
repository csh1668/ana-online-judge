"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-manual-inbox";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export async function listWorkshopManualInbox(problemId: number) {
	const { userId } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId); // access check
	const files = await svc.listInbox(problemId, userId);
	return { files };
}

export async function uploadWorkshopManualInboxFile(problemId: number, formData: FormData) {
	const { userId } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId);

	const file = formData.get("file");
	const nameRaw = formData.get("name");
	if (!(file instanceof File) || file.size === 0) {
		throw new Error("파일을 선택해주세요");
	}
	const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : file.name;
	const content = Buffer.from(await file.arrayBuffer());
	const created = await svc.uploadInboxFile({
		problemId,
		userId,
		filename: name,
		content,
	});
	revalidatePath(`/workshop/${problemId}/testcases`);
	return created;
}

export async function renameWorkshopManualInboxFile(
	problemId: number,
	oldName: string,
	newName: string
) {
	const { userId } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId);
	await svc.renameInboxFile({ problemId, userId, oldName, newName });
	revalidatePath(`/workshop/${problemId}/testcases`);
}

export async function deleteWorkshopManualInboxFile(problemId: number, filename: string) {
	const { userId } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId);
	await svc.deleteInboxFile({ problemId, userId, filename });
	revalidatePath(`/workshop/${problemId}/testcases`);
}
