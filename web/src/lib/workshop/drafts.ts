import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopDraft,
	workshopDrafts,
	workshopProblemMembers,
	workshopResources,
} from "@/db/schema";
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

/**
 * Read-only variant of ensureWorkshopDraft — returns the existing draft or
 * null when the user has no draft yet. Does not create or seed anything.
 * Use this in list/read endpoints where auto-creation is undesired.
 */
export async function getDraftForUser(
	problemId: number,
	userId: number
): Promise<WorkshopDraft | null> {
	const [row] = await db
		.select()
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	return row ?? null;
}

/**
 * Return the user's active draft, creating it (with testlib.h seeding) if it
 * does not yet exist. Throws if the user is not a member of the problem.
 * Callers that already checked membership can skip straight to ensureWorkshopDraft.
 */
export async function getActiveDraftForUser(
	problemId: number,
	userId: number
): Promise<WorkshopDraft> {
	const [member] = await db
		.select({ role: workshopProblemMembers.role })
		.from(workshopProblemMembers)
		.where(
			and(
				eq(workshopProblemMembers.workshopProblemId, problemId),
				eq(workshopProblemMembers.userId, userId)
			)
		)
		.limit(1);
	if (!member) {
		throw new Error("이 문제의 멤버가 아닙니다");
	}
	return ensureWorkshopDraft(problemId, userId);
}
