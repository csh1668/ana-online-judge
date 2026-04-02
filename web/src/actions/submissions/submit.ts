"use server";

import { revalidatePath } from "next/cache";
import * as submissionsService from "@/lib/services/submissions";

export async function submitCode(...args: Parameters<typeof submissionsService.submitCode>) {
	const result = await submissionsService.submitCode(...args);
	if (result.submissionId) {
		revalidatePath("/submissions");
		revalidatePath(`/problems/${args[0].problemId}`);
	}
	return result;
}

export type SubmitCodeResult = Awaited<ReturnType<typeof submitCode>>;
