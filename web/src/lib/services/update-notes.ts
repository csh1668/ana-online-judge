import "server-only";

import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type UpdateNote, updateNotes } from "@/db/schema";

export type UpdateNoteInput = {
	title: string;
	body: string;
	publishedAt: Date;
};

/** 업데이트 노트 목록(반영 시점 최신순, 페이지네이션). */
export async function getUpdateNotes({
	page = 1,
	limit = 20,
}: {
	page?: number;
	limit?: number;
} = {}): Promise<{ items: UpdateNote[]; total: number }> {
	const offset = (page - 1) * limit;
	const [items, [row]] = await Promise.all([
		db
			.select()
			.from(updateNotes)
			.orderBy(desc(updateNotes.publishedAt), desc(updateNotes.id))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(updateNotes),
	]);
	return { items, total: row?.count ?? 0 };
}

/** 단건 조회. 없으면 null. */
export async function getUpdateNote(id: number): Promise<UpdateNote | null> {
	const [row] = await db.select().from(updateNotes).where(eq(updateNotes.id, id)).limit(1);
	return row ?? null;
}

function normalize(input: UpdateNoteInput): UpdateNoteInput {
	const title = input.title.trim();
	const body = input.body.trim();
	if (title.length === 0) throw new Error("제목을 입력하세요.");
	if (body.length === 0) throw new Error("본문을 입력하세요.");
	if (Number.isNaN(input.publishedAt.getTime()))
		throw new Error("업데이트 시간이 올바르지 않습니다.");
	return { title, body, publishedAt: input.publishedAt };
}

/** 업데이트 노트 생성. */
export async function createUpdateNote(
	input: UpdateNoteInput,
	createdBy?: number | null
): Promise<UpdateNote> {
	const values = normalize(input);
	const [row] = await db
		.insert(updateNotes)
		.values({ ...values, createdBy: createdBy ?? null })
		.returning();
	return row;
}

/** 업데이트 노트 수정. 대상이 없으면 에러. */
export async function updateUpdateNote(id: number, input: UpdateNoteInput): Promise<UpdateNote> {
	const values = normalize(input);
	const [row] = await db
		.update(updateNotes)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(updateNotes.id, id))
		.returning();
	if (!row) throw new Error("업데이트 노트를 찾을 수 없습니다.");
	return row;
}

/** 업데이트 노트 삭제. */
export async function deleteUpdateNote(id: number): Promise<void> {
	await db.delete(updateNotes).where(eq(updateNotes.id, id));
}
