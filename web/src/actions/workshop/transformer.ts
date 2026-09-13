"use server";

import { revalidatePath } from "next/cache";
import * as problemsSvc from "@/lib/services/workshop-problems";
import * as svc from "@/lib/services/workshop-transformer";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export async function getWorkshopTransformer(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	// Ensure the draft exists (transformer itself has no bundled default).
	await getActiveDraftForUser(problemId, userId, isAdmin);
	return svc.getTransformerSource(problemId, userId);
}

export async function saveWorkshopTransformer(
	problemId: number,
	input: { language: svc.TransformerLanguage; source: string; expectedVersion: number }
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	await getActiveDraftForUser(problemId, userId, isAdmin);
	await svc.saveTransformerSource({
		problemId,
		userId,
		language: input.language,
		source: input.source,
		expectedVersion: input.expectedVersion,
	});
	// Re-fetch TransformerState so the client gets consistent data.
	const state = await svc.getTransformerSource(problemId, userId);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/transformer`);
	return state;
}
