import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workshopDrafts } from "@/db/schema";
import { DRAFT_VERSION_CONFLICT_MESSAGE } from "./draft-version";

/**
 * Resolve the error to throw after a version-guarded UPDATE affects 0 rows.
 * Distinguishes "someone else's concurrent edit bumped the version"
 * (conflict) from "the draft doesn't exist at all" (not found).
 *
 * Server-only (imports `@/db`) — services import this; "use client" edit
 * forms should import `DRAFT_VERSION_CONFLICT_MESSAGE` from `./draft-version`
 * instead, never this module.
 *
 * Usage: `if (!updated) throw await draftUpdateConflictError(problemId, userId);`
 */
export async function draftUpdateConflictError(problemId: number, userId: number): Promise<Error> {
	const [exists] = await db
		.select({ id: workshopDrafts.id })
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (exists) return new Error(DRAFT_VERSION_CONFLICT_MESSAGE);
	return new Error("드래프트를 찾을 수 없습니다");
}
