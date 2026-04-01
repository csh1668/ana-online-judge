"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as adminJudgeTools from "@/lib/services/judge-tools";

export async function uploadChecker(...args: Parameters<typeof adminJudgeTools.uploadChecker>) {
	await requireAdmin();
	const result = await adminJudgeTools.uploadChecker(...args);
	revalidatePath(`/admin/problems/${args[0]}`);
	return result;
}

export async function uploadValidator(...args: Parameters<typeof adminJudgeTools.uploadValidator>) {
	await requireAdmin();
	const result = await adminJudgeTools.uploadValidator(...args);
	revalidatePath(`/admin/problems/${args[0]}`);
	return result;
}

export async function validateTestcases(
	...args: Parameters<typeof adminJudgeTools.validateTestcases>
) {
	await requireAdmin();
	return adminJudgeTools.validateTestcases(...args);
}

export async function getValidationResult(
	...args: Parameters<typeof adminJudgeTools.getValidationResult>
) {
	await requireAdmin();
	return adminJudgeTools.getValidationResult(...args);
}

export async function refreshContestScoreboard(
	...args: Parameters<typeof adminJudgeTools.refreshContestScoreboard>
) {
	await requireAdmin();
	const result = await adminJudgeTools.refreshContestScoreboard(...args);
	revalidatePath(`/contests/${args[0]}`);
	revalidatePath(`/contests/${args[0]}/scoreboard`);
	return result;
}

export type UploadCheckerReturn = Awaited<ReturnType<typeof uploadChecker>>;
export type UploadValidatorReturn = Awaited<ReturnType<typeof uploadValidator>>;
export type ValidateTestcasesReturn = Awaited<ReturnType<typeof validateTestcases>>;
export type GetValidationResultReturn = Awaited<ReturnType<typeof getValidationResult>>;
export type RefreshContestScoreboardReturn = Awaited<ReturnType<typeof refreshContestScoreboard>>;
