"use server";

import { revalidatePath } from "next/cache";
import { getSessionInfo } from "@/lib/auth-utils";
import * as submissionsService from "@/lib/services/submissions";
import { CaptchaRequiredError } from "@/lib/turnstile-guard";
import { assertSubmitTicket } from "@/lib/turnstile-ticket";

export async function submitCode(data: {
	problemId: number;
	code: string;
	language: string;
	contestId?: number;
}): Promise<{ submissionId?: number; error?: string; needsCaptcha?: boolean }> {
	const { userId } = await getSessionInfo();
	if (!userId) return { error: "로그인이 필요합니다." };

	try {
		await assertSubmitTicket(userId);
	} catch (e) {
		if (e instanceof CaptchaRequiredError) {
			return { needsCaptcha: true, error: e.message };
		}
		throw e;
	}

	const result = await submissionsService.submitCode({ ...data, userId });
	if (result.submissionId) {
		revalidatePath("/submissions");
		revalidatePath(`/problems/${data.problemId}`);
	}
	return result;
}

export type SubmitCodeResult = Awaited<ReturnType<typeof submitCode>>;
