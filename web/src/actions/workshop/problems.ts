"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-problems";
import { assertTurnstile } from "@/lib/turnstile-guard";
import { requireGroupAccess, requireWorkshopAccess } from "@/lib/workshop/auth";
import { ensureWorkshopDraft } from "@/lib/workshop/drafts";

export async function createWorkshopProblem(
	input: Parameters<typeof svc.createWorkshopProblem>[0],
	turnstileToken?: string
) {
	await assertTurnstile(turnstileToken);
	const { userId } = await requireWorkshopAccess();
	if (input.groupId !== undefined) {
		await requireGroupAccess(input.groupId);
	}
	const problem = await svc.createWorkshopProblem(input, userId);
	await ensureWorkshopDraft(problem.id, userId);
	revalidatePath("/workshop");
	if (input.groupId !== undefined) {
		revalidatePath(`/workshop/groups/${input.groupId}`);
	}
	return problem;
}

export async function listMyWorkshopProblems() {
	const { userId, isAdmin } = await requireWorkshopAccess();
	return svc.listMyWorkshopProblems(userId, isAdmin);
}

export async function getWorkshopProblemWithDraft(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await svc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	const draft = await ensureWorkshopDraft(problem.id, userId);
	return { problem, draft };
}

export async function updateWorkshopProblemLimits(
	problemId: number,
	input: { timeLimit: number; memoryLimit: number }
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await svc.updateWorkshopProblemLimits(problemId, userId, input, isAdmin);
	revalidatePath(`/workshop/${problemId}`);
}

export async function deleteWorkshopProblem(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await svc.deleteWorkshopProblem(problemId, userId, isAdmin);
	revalidatePath("/workshop");
	revalidatePath("/admin/workshop");
}
