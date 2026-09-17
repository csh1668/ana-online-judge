"use server";

import { revalidatePath } from "next/cache";
import type { UpdateNote } from "@/db/schema";
import { getSessionInfo, requireAdmin } from "@/lib/auth-utils";
import * as svc from "@/lib/services/update-notes";

/** 업데이트 노트 목록(공개). */
export async function getUpdateNotes(
	params: Parameters<typeof svc.getUpdateNotes>[0] = {}
): Promise<{ items: UpdateNote[]; total: number }> {
	return svc.getUpdateNotes(params);
}

/** 업데이트 노트 단건 조회(공개). 없으면 null. */
export async function getUpdateNote(id: number): Promise<UpdateNote | null> {
	return svc.getUpdateNote(id);
}

function revalidate() {
	revalidatePath("/updates");
	revalidatePath("/admin/updates");
}

/** 업데이트 노트 생성(관리자 전용). */
export async function createUpdateNoteAction(input: svc.UpdateNoteInput): Promise<UpdateNote> {
	await requireAdmin();
	const { userId } = await getSessionInfo();
	const note = await svc.createUpdateNote(input, userId);
	revalidate();
	return note;
}

/** 업데이트 노트 수정(관리자 전용). */
export async function updateUpdateNoteAction(
	id: number,
	input: svc.UpdateNoteInput
): Promise<UpdateNote> {
	await requireAdmin();
	const note = await svc.updateUpdateNote(id, input);
	revalidate();
	return note;
}

/** 업데이트 노트 삭제(관리자 전용). */
export async function deleteUpdateNoteAction(id: number): Promise<void> {
	await requireAdmin();
	await svc.deleteUpdateNote(id);
	revalidate();
}
