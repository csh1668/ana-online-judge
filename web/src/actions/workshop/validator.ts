"use server";

import { revalidatePath } from "next/cache";
import * as problemsSvc from "@/lib/services/workshop-problems";
import * as svc from "@/lib/services/workshop-validator";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";
import { ensureValidateSubscriberStarted } from "@/lib/workshop/validate-pubsub";

export async function getWorkshopValidatorState(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	await getActiveDraftForUser(problemId, userId);
	return svc.getValidatorSource(problemId);
}

export async function saveWorkshopValidatorSource(
	problemId: number,
	input: { language: svc.ValidatorLanguage; source: string }
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	await getActiveDraftForUser(problemId, userId);
	const updated = await svc.saveValidatorSource({
		problemId,
		userId,
		language: input.language,
		source: input.source,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/validator`);
	return updated;
}

export async function deleteWorkshopValidator(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	await getActiveDraftForUser(problemId, userId);
	const updated = await svc.deleteValidator(problemId);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/validator`);
	return updated;
}

export async function startWorkshopFullValidation(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	const draft = await getActiveDraftForUser(problemId, userId);

	// Ensure the singleton subscriber is running before we publish.
	await ensureValidateSubscriberStarted();

	const queued = await svc.runFullValidation({
		problemId,
		userId,
		draftId: draft.id,
	});
	revalidatePath(`/workshop/${problemId}/validator`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	return { draftId: draft.id, jobs: queued };
}
