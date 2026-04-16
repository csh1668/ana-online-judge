"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-checker";
import * as problemsSvc from "@/lib/services/workshop-problems";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import type { WorkshopCheckerPreset } from "@/lib/workshop/bundled";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export async function getWorkshopCheckerState(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	// Ensure the draft + default checker exist.
	await getActiveDraftForUser(problemId, userId);
	return svc.getCheckerSource(problemId);
}

export async function saveWorkshopCheckerSource(
	problemId: number,
	input: { language: svc.CheckerLanguage; source: string }
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	await getActiveDraftForUser(problemId, userId);
	const updated = await svc.saveCheckerSource({
		problemId,
		userId,
		language: input.language,
		source: input.source,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/checker`);
	return updated;
}

export async function resetWorkshopCheckerToPreset(
	problemId: number,
	preset: WorkshopCheckerPreset
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	await getActiveDraftForUser(problemId, userId);
	const state = await svc.resetCheckerToPreset({ problemId, userId, preset });
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/checker`);
	return state;
}
