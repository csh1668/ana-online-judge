"use server";

import { revalidatePath } from "next/cache";
import * as problemsSvc from "@/lib/services/workshop-problems";
import * as runner from "@/lib/services/workshop-script-runner";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";
import { WorkshopScriptParseError } from "@/lib/workshop/script-parser";

export async function getWorkshopScript(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	const script = await runner.getScript(problemId);
	return { script };
}

export async function saveWorkshopScript(problemId: number, script: string) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	await runner.saveScript(problemId, script);
	revalidatePath(`/workshop/${problemId}/testcases`);
	return { success: true };
}

export async function runWorkshopScript(problemId: number, script: string) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");

	const draft = await getActiveDraftForUser(problemId, userId);

	// Persist the latest script content before running — the user likely
	// just typed it and hasn't clicked 저장. Revalidate now too so the cached
	// page reflects the saved script even if the run below fails.
	await runner.saveScript(problemId, script);
	revalidatePath(`/workshop/${problemId}/testcases`);

	try {
		const outcome = await runner.runScript({
			problem,
			userId,
			draftId: draft.id,
			script,
		});
		revalidatePath(`/workshop/${problemId}`);
		revalidatePath(`/workshop/${problemId}/testcases`);
		return { ok: true as const, ...outcome };
	} catch (err) {
		if (err instanceof WorkshopScriptParseError) {
			return {
				ok: false as const,
				kind: "parse" as const,
				errors: err.errors,
			};
		}
		return {
			ok: false as const,
			kind: "runtime" as const,
			message: err instanceof Error ? err.message : "알 수 없는 오류",
		};
	}
}
