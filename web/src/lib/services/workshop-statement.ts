import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopProblem, workshopProblems } from "@/db/schema";

export type UpdateStatementInput = {
	title: string;
	description: string;
};

/**
 * Update the title and markdown description of a workshop problem.
 * Trims title; rejects empty titles.
 */
export async function updateStatement(
	problemId: number,
	input: UpdateStatementInput
): Promise<WorkshopProblem> {
	const title = input.title.trim();
	if (!title) {
		throw new Error("제목은 비어 있을 수 없습니다");
	}
	if (title.length > 200) {
		throw new Error("제목은 200자 이내여야 합니다");
	}
	if (input.description.length > 200_000) {
		throw new Error("지문은 200,000자 이내여야 합니다");
	}
	const [updated] = await db
		.update(workshopProblems)
		.set({ title, description: input.description, updatedAt: new Date() })
		.where(eq(workshopProblems.id, problemId))
		.returning();
	if (!updated) throw new Error("문제를 찾을 수 없습니다");
	return updated;
}
