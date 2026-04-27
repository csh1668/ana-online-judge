"use server";

import { revalidatePath } from "next/cache";

/**
 * Invalidate caches that depend on the viewer's "solved" set after a new
 * accepted/full-score submission lands. The list views render row-level
 * codeAccess that can become stale until the next fresh fetch.
 */
export async function revalidateProblemAfterAccepted(problemId: number) {
	revalidatePath(`/problems/${problemId}`);
	revalidatePath("/submissions");
}
