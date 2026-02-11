"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { testcases } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

// Testcases CRUD
export async function getTestcases(problemId: number) {
	await requireAdmin();

	return db
		.select()
		.from(testcases)
		.where(eq(testcases.problemId, problemId))
		.orderBy(testcases.id);
}

export async function createTestcase(data: {
	problemId: number;
	inputPath: string;
	outputPath: string;
	subtaskGroup?: number;
	isHidden?: boolean;
	score?: number;
}) {
	await requireAdmin();

	const [newTestcase] = await db.insert(testcases).values(data).returning();

	revalidatePath(`/admin/problems/${data.problemId}/testcases`);

	return newTestcase;
}

export async function deleteTestcase(id: number, problemId: number) {
	await requireAdmin();

	await db.delete(testcases).where(eq(testcases.id, id));

	revalidatePath(`/admin/problems/${problemId}/testcases`);

	return { success: true };
}

export type GetTestcasesReturn = Awaited<ReturnType<typeof getTestcases>>;
export type CreateTestcaseReturn = Awaited<ReturnType<typeof createTestcase>>;
export type DeleteTestcaseReturn = Awaited<ReturnType<typeof deleteTestcase>>;
