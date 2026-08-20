import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopDraft, workshopDrafts } from "@/db/schema";
import { draftUpdateConflictError } from "@/lib/workshop/draft-version-conflict";

export type UpdateStatementInput = {
	title: string;
	description: string;
	expectedVersion: number;
};

/**
 * 호출자 draft의 title/description(markdown)을 갱신한다. (Phase A: per-draft)
 * 낙관적 버전 가드: `input.expectedVersion`이 현재 `workshopDrafts.version`과
 * 다르면(다른 세션의 동시 저장) 충돌 에러를 던진다.
 */
export async function updateStatement(
	problemId: number,
	userId: number,
	input: UpdateStatementInput
): Promise<WorkshopDraft> {
	const title = input.title.trim();
	if (!title) throw new Error("제목은 비어 있을 수 없습니다");
	if (title.length > 200) throw new Error("제목은 200자 이내여야 합니다");
	if (input.description.length > 200_000) throw new Error("지문은 200,000자 이내여야 합니다");
	const [updated] = await db
		.update(workshopDrafts)
		.set({
			title,
			description: input.description,
			version: sql`${workshopDrafts.version} + 1`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(workshopDrafts.workshopProblemId, problemId),
				eq(workshopDrafts.userId, userId),
				eq(workshopDrafts.version, input.expectedVersion)
			)
		)
		.returning();
	if (!updated) throw await draftUpdateConflictError(problemId, userId);
	return updated;
}
