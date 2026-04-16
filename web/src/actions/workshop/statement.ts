"use server";

import { revalidatePath } from "next/cache";
import * as problemsSvc from "@/lib/services/workshop-problems";
import * as svc from "@/lib/services/workshop-statement";
import { requireWorkshopAccess } from "@/lib/workshop/auth";

export async function updateWorkshopStatement(
	problemId: number,
	input: Parameters<typeof svc.updateStatement>[1]
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	const updated = await svc.updateStatement(problemId, input);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/statement`);
	return updated;
}
