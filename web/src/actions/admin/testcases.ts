"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as adminTestcases from "@/lib/services/testcases";

export async function getTestcases(...args: Parameters<typeof adminTestcases.getTestcases>) {
	await requireAdmin();
	return adminTestcases.getTestcases(...args);
}

export async function createTestcase(...args: Parameters<typeof adminTestcases.createTestcase>) {
	await requireAdmin();
	const result = await adminTestcases.createTestcase(...args);
	revalidatePath(`/admin/problems/${args[0].problemId}/testcases`);
	return result;
}

export async function deleteTestcase(id: number, problemId: number) {
	await requireAdmin();
	const result = await adminTestcases.deleteTestcase(id);
	revalidatePath(`/admin/problems/${problemId}/testcases`);
	return result;
}

export async function updateTestcase(
	id: number,
	problemId: number,
	data: { score?: number; subtaskGroup?: number; isHidden?: boolean }
) {
	await requireAdmin();
	const result = await adminTestcases.updateTestcase(id, data);
	revalidatePath(`/admin/problems/${problemId}/testcases`);
	return result;
}

export type GetTestcasesReturn = Awaited<ReturnType<typeof getTestcases>>;
export type CreateTestcaseReturn = Awaited<ReturnType<typeof createTestcase>>;
export type DeleteTestcaseReturn = Awaited<ReturnType<typeof deleteTestcase>>;
export type UpdateTestcaseReturn = Awaited<ReturnType<typeof updateTestcase>>;
