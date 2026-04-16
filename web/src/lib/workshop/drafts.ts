import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopDraft,
	workshopDrafts,
	workshopProblemMembers,
	workshopProblems,
	workshopResources,
} from "@/db/schema";
import { uploadFile } from "@/lib/storage/operations";
import {
	readBundledCheckerSource,
	readBundledWorkshopResource,
	WORKSHOP_BUNDLED_TESTLIB_FILENAME,
} from "./bundled";
import { workshopDraftCheckerPath, workshopDraftResourcePath } from "./paths";

const DEFAULT_CHECKER_PRESET = "icpc_diff" as const;

/**
 * Ensure a draft exists for (problemId, userId). If not, create it and seed
 * testlib.h into its resources/ plus the default icpc_diff checker.
 * Idempotent — if the row exists and the checker slot is already populated,
 * returns without changes. If the row exists but checkerPath is null
 * (e.g. problem pre-dates Phase 5), seeds the default checker into the draft.
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
		await ensureDefaultCheckerSeeded(problemId, userId);
		return existing[0];
	}

	const [draft] = await db
		.insert(workshopDrafts)
		.values({ workshopProblemId: problemId, userId })
		.returning();

	await seedBundledResources(problemId, userId, draft.id);
	await ensureDefaultCheckerSeeded(problemId, userId);
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
 * Seed `icpc_diff.cpp` into the draft's checker slot if and only if
 * `workshopProblems.checkerPath` is currently null. Safe to call on every
 * draft-ensure roundtrip — short-circuits when already seeded.
 */
async function ensureDefaultCheckerSeeded(problemId: number, userId: number): Promise<void> {
	const [row] = await db
		.select({
			checkerPath: workshopProblems.checkerPath,
			checkerLanguage: workshopProblems.checkerLanguage,
		})
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!row) return;
	if (row.checkerPath) return;

	const content = await readBundledCheckerSource(DEFAULT_CHECKER_PRESET);
	const path = workshopDraftCheckerPath(problemId, userId, "cpp");
	await uploadFile(path, content, "text/x-c++src");
	await db
		.update(workshopProblems)
		.set({ checkerPath: path, checkerLanguage: "cpp", updatedAt: new Date() })
		.where(eq(workshopProblems.id, problemId));
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
 * Return the user's active draft, creating it (with testlib.h + icpc_diff
 * seeding) if it does not yet exist. Throws if the user is not a member of
 * the problem. Callers that already checked membership can skip straight to
 * ensureWorkshopDraft.
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
