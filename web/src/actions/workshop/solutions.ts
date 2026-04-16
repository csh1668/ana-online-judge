"use server";

import { revalidatePath } from "next/cache";
import type { Language } from "@/db/schema";
import * as svc from "@/lib/services/workshop-solutions";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";
import type { WorkshopExpectedVerdict } from "@/lib/workshop/expected-verdict";

export async function listWorkshopSolutions(problemId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const rows = await svc.listSolutionsForDraft(draft.id);
	return { draftId: draft.id, solutions: rows };
}

export async function readWorkshopSolutionSource(problemId: number, solutionId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	return svc.readSolutionSource(solutionId, draft.id);
}

export async function createWorkshopSolution(
	problemId: number,
	input: {
		name: string;
		language: Language;
		source: string;
		expectedVerdict: WorkshopExpectedVerdict;
		isMain: boolean;
	}
) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const created = await svc.createSolution({
		problemId,
		userId,
		draftId: draft.id,
		name: input.name.trim(),
		language: input.language,
		source: input.source,
		expectedVerdict: input.expectedVerdict,
		isMain: input.isMain,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
	return created;
}

export async function updateWorkshopSolution(
	problemId: number,
	solutionId: number,
	input: {
		name?: string;
		language?: Language;
		source?: string;
		expectedVerdict?: WorkshopExpectedVerdict;
	}
) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const updated = await svc.updateSolution({
		problemId,
		userId,
		draftId: draft.id,
		solutionId,
		name: input.name?.trim(),
		language: input.language,
		source: input.source,
		expectedVerdict: input.expectedVerdict,
	});
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
	return updated;
}

export async function setWorkshopMainSolution(problemId: number, solutionId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	await svc.setMainSolution(draft.id, solutionId);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
}

export async function deleteWorkshopSolution(problemId: number, solutionId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	await svc.deleteSolution(draft.id, solutionId);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
}
