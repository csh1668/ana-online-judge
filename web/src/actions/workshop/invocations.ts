"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-invocations";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export async function listWorkshopInvocations(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId, isAdmin);
	return svc.listInvocations(problemId, 20);
}

export async function getWorkshopInvocation(problemId: number, invocationId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	await getActiveDraftForUser(problemId, userId, isAdmin);
	const row = await svc.getInvocation(invocationId);
	if (!row || row.workshopProblemId !== problemId) return null;
	return row;
}

export async function checkInvocationPreconditionAction(
	problemId: number,
	selectedSolutionIds: number[],
	selectedTestcaseIds: number[]
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);
	return svc.checkInvocationPrecondition({
		draftId: draft.id,
		selectedSolutionIds,
		selectedTestcaseIds,
	});
}

export async function runWorkshopInvocation(
	problemId: number,
	selectedSolutionIds: number[],
	selectedTestcaseIds: number[]
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);
	const result = await svc.createInvocation({
		problemId,
		userId,
		draftId: draft.id,
		selectedSolutionIds,
		selectedTestcaseIds,
	});
	revalidatePath(`/workshop/${problemId}/invocations`);
	revalidatePath(`/workshop/${problemId}`);
	return result;
}

export async function generateWorkshopAnswers(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);
	const result = await svc.generateAnswers({ problemId, userId, draftId: draft.id });
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/invocations`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	return result;
}
