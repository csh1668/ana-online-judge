"use server";

import { revalidatePath } from "next/cache";
import * as submissionsService from "@/lib/services/submissions";
import { CaptchaRequiredError } from "@/lib/turnstile-guard";
import { assertSubmitTicket } from "@/lib/turnstile-ticket";

export async function submitCode(
	...args: Parameters<typeof submissionsService.submitCode>
): Promise<{ submissionId?: number; error?: string; needsCaptcha?: boolean }> {
	try {
		await assertSubmitTicket(args[0].userId);
	} catch (e) {
		if (e instanceof CaptchaRequiredError) {
			return { needsCaptcha: true, error: e.message };
		}
		throw e;
	}
	const result = await submissionsService.submitCode(...args);
	if (result.submissionId) {
		revalidatePath("/submissions");
		revalidatePath(`/problems/${args[0].problemId}`);
	}
	return result;
}

export type SubmitCodeResult = Awaited<ReturnType<typeof submitCode>>;
