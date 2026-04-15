import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopDraft, workshopDrafts, workshopResources } from "@/db/schema";
import { uploadFile } from "@/lib/storage/operations";
import { readBundledWorkshopResource, WORKSHOP_BUNDLED_TESTLIB_FILENAME } from "./bundled";
import { workshopDraftResourcePath } from "./paths";

/**
 * Ensure a draft exists for (problemId, userId). If not, create it and seed
 * testlib.h into its resources/. Idempotent.
 */
export async function ensureWorkshopDraft(
	problemId: number,
	userId: number
): Promise<WorkshopDraft> {
	const existing = await db
		.select()
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (existing.length > 0) {
		return existing[0];
	}

	const [draft] = await db
		.insert(workshopDrafts)
		.values({ workshopProblemId: problemId, userId })
		.returning();

	await seedBundledResources(problemId, userId, draft.id);
	return draft;
}

async function seedBundledResources(
	problemId: number,
	userId: number,
	draftId: number
): Promise<void> {
	const filename = WORKSHOP_BUNDLED_TESTLIB_FILENAME;
	const content = await readBundledWorkshopResource(filename);
	const path = workshopDraftResourcePath(problemId, userId, filename);
	await uploadFile(path, content, "text/plain");
	await db.insert(workshopResources).values({ draftId, name: filename, path });
}
