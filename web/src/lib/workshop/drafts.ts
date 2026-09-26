import { randomBytes } from "node:crypto";
import { and, desc, eq, notLike } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopDraft,
	type WorkshopProblemType,
	workshopDrafts,
	workshopProblemMembers,
	workshopProblems,
	workshopResources,
	workshopSnapshots,
} from "@/db/schema";
import { adoptLatestSnapshotIfNoWork } from "@/lib/services/workshop-snapshots";
import { uploadFile } from "@/lib/storage/operations";
import {
	readBundledCheckerSource,
	readBundledWorkshopResource,
	WORKSHOP_DEFAULT_RESOURCE_FILENAMES,
} from "./bundled";
import { draftOpLockKey, WorkshopLockBusyError, withWorkshopLock } from "./op-lock";
import { workshopDraftCheckerPath, workshopDraftResourcePath } from "./paths";

const DEFAULT_CHECKER_PRESET = "icpc_diff" as const;

/** Seeding is a handful of small uploads; the TTL only bounds a crashed holder. */
const SEED_LOCK_TTL_SEC = 60;

async function withDraftSeedLock(draftId: number, fn: () => Promise<void>): Promise<boolean> {
	try {
		await withWorkshopLock(draftOpLockKey(draftId), SEED_LOCK_TTL_SEC, fn);
		return true;
	} catch (err) {
		if (err instanceof WorkshopLockBusyError) return false;
		throw err;
	}
}

/**
 * Header values used to bootstrap a brand-new draft via {@link ensureWorkshopDraft}.
 * Supplied by the create flow so the freshly-minted owner draft starts with the
 * title/type/limits the user entered in the new-problem form.
 */
export type DraftBootstrap = {
	title: string;
	problemType: WorkshopProblemType;
	timeLimit: number;
	memoryLimit: number;
};

/** Editable header fields copied onto a new draft at creation time. */
type DraftHeader = {
	title: string;
	description: string;
	problemType: WorkshopProblemType;
	timeLimit: number;
	memoryLimit: number;
	seed: string;
};

function freshSeed(): string {
	return randomBytes(8).toString("hex");
}

/**
 * Compute the header values for a newly-created draft, in priority order:
 *   1. `bootstrap` (create flow) — title/type/limits from the form + fresh seed.
 *   2. Latest user-committed snapshot's `stateJson.problem` for this problem.
 *   3. The creator's draft header (the draft owned by `workshopProblems.createdBy`).
 *   4. Hard defaults (empty title/description, icpc, 1000ms/512MB, fresh seed).
 *
 * This only fills the *header*. The rest of the draft (testcases, generators,
 * solutions, checker, validator) is hydrated separately by
 * `adoptLatestSnapshotIfNoWork`, which also sets `baseSnapshotId`; the header
 * copy in step 2 is the fallback that keeps the draft sane if that restore
 * fails.
 */
async function resolveNewDraftHeader(
	problemId: number,
	bootstrap?: DraftBootstrap
): Promise<DraftHeader> {
	// 1. Create flow: take the user-entered header verbatim + a fresh seed.
	if (bootstrap) {
		return {
			title: bootstrap.title,
			description: "",
			problemType: bootstrap.problemType,
			timeLimit: bootstrap.timeLimit,
			memoryLimit: bootstrap.memoryLimit,
			seed: freshSeed(),
		};
	}

	// 2. Latest user-committed snapshot (exclude `auto/...` system snapshots).
	const [latestSnapshot] = await db
		.select({ stateJson: workshopSnapshots.stateJson })
		.from(workshopSnapshots)
		.where(
			and(
				eq(workshopSnapshots.workshopProblemId, problemId),
				notLike(workshopSnapshots.label, "auto/%")
			)
		)
		.orderBy(desc(workshopSnapshots.id))
		.limit(1);
	if (latestSnapshot) {
		const state = latestSnapshot.stateJson as {
			problem?: {
				title: string;
				description: string;
				problemType: WorkshopProblemType;
				timeLimit: number;
				memoryLimit: number;
				seed: string;
			};
		};
		if (state.problem) {
			return {
				title: state.problem.title,
				description: state.problem.description,
				problemType: state.problem.problemType,
				timeLimit: state.problem.timeLimit,
				memoryLimit: state.problem.memoryLimit,
				seed: state.problem.seed,
			};
		}
	}

	// 3. The creator's draft for this problem.
	const [creatorDraft] = await db
		.select({
			title: workshopDrafts.title,
			description: workshopDrafts.description,
			problemType: workshopDrafts.problemType,
			timeLimit: workshopDrafts.timeLimit,
			memoryLimit: workshopDrafts.memoryLimit,
			seed: workshopDrafts.seed,
		})
		.from(workshopDrafts)
		.innerJoin(workshopProblems, eq(workshopProblems.id, workshopDrafts.workshopProblemId))
		.where(
			and(
				eq(workshopDrafts.workshopProblemId, problemId),
				eq(workshopDrafts.userId, workshopProblems.createdBy)
			)
		)
		.limit(1);
	if (creatorDraft) {
		return {
			title: creatorDraft.title,
			description: creatorDraft.description,
			problemType: creatorDraft.problemType,
			timeLimit: creatorDraft.timeLimit,
			memoryLimit: creatorDraft.memoryLimit,
			seed: creatorDraft.seed,
		};
	}

	// 4. Defaults.
	return {
		title: "",
		description: "",
		problemType: "icpc",
		timeLimit: 1000,
		memoryLimit: 512,
		seed: freshSeed(),
	};
}

/**
 * Ensure a draft exists for (problemId, userId). If not, create it with a
 * populated header (see {@link resolveNewDraftHeader}) and seed testlib.h into
 * its resources/ plus the default icpc_diff checker. Pass `bootstrap` from the
 * create flow to seed the header from the new-problem form.
 * Idempotent — if the row exists and the checker slot is already populated,
 * returns without changes (header is never overwritten on an existing row).
 * If the row exists but checkerPath is null (e.g. problem pre-dates Phase 5),
 * seeds the default checker into the draft.
 *
 * Finally, a draft that holds no user work is fast-forwarded onto the latest
 * user-committed snapshot with no backup snapshot (see
 * {@link adoptLatestSnapshotIfNoWork}). Without this, a first open of a
 * teammate's problem lands on `baseSnapshotId = null` and is reported as a
 * stale draft even though the user has done nothing yet.
 */
export async function ensureWorkshopDraft(
	problemId: number,
	userId: number,
	bootstrap?: DraftBootstrap
): Promise<WorkshopDraft> {
	// Fast path: if the draft already exists, return it without resolving a
	// bootstrap header — ensureWorkshopDraft is on the hot path (every workshop
	// page load), so avoid the snapshot/creator-draft lookups when not inserting.
	const [preexisting] = await db
		.select()
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (preexisting) {
		await ensureDefaultCheckerSeeded(problemId, userId);
		return await syncUntouchedDraft(problemId, userId, preexisting);
	}

	// No draft yet — compute the header and insert. ON CONFLICT DO NOTHING guards
	// against a concurrent first-open by the same user.
	const header = await resolveNewDraftHeader(problemId, bootstrap);
	const inserted = await db
		.insert(workshopDrafts)
		.values({ workshopProblemId: problemId, userId, ...header })
		.onConflictDoNothing()
		.returning();

	if (inserted.length > 0) {
		// Newly created — seed defaults, serialized against a concurrent
		// auto-adopt of this same draft (see withDraftSeedLock). If the lock is
		// busy, that adopt is already rebuilding the draft from a snapshot and
		// its outcome supersedes the seed, so skipping is correct.
		const draft = inserted[0];
		await withDraftSeedLock(draft.id, async () => {
			await seedBundledResources(problemId, userId, draft.id);
			await seedDefaultChecker(problemId, userId);
		});
		return await syncUntouchedDraft(problemId, userId, draft);
	}

	// Lost the race — another caller created the row between our SELECT and INSERT.
	const [existing] = await db
		.select()
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!existing) {
		throw new Error("드래프트 생성 실패 (concurrent delete?)");
	}
	await ensureDefaultCheckerSeeded(problemId, userId);
	return await syncUntouchedDraft(problemId, userId, existing);
}

/**
 * Fast-forward `draft` onto the latest user-committed snapshot when it holds no
 * user work, and return the resulting row. The restore rewrites the draft row
 * (header + baseSnapshotId), so the caller's copy must be re-read afterwards.
 * Returns `draft` untouched when nothing was adopted.
 */
async function syncUntouchedDraft(
	problemId: number,
	userId: number,
	draft: WorkshopDraft
): Promise<WorkshopDraft> {
	const adopted = await adoptLatestSnapshotIfNoWork({ problemId, userId, draft });
	if (!adopted) return draft;
	const [refreshed] = await db
		.select()
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	return refreshed ?? draft;
}

async function seedBundledResources(
	problemId: number,
	userId: number,
	draftId: number
): Promise<void> {
	for (const filename of WORKSHOP_DEFAULT_RESOURCE_FILENAMES) {
		const content = await readBundledWorkshopResource(filename);
		const path = workshopDraftResourcePath(problemId, userId, filename);
		await uploadFile(path, content, "text/plain");
		await db.insert(workshopResources).values({ draftId, name: filename, path });
	}
}

/**
 * Top up an *existing* draft's `resources/` slot with any default resource
 * filenames (see {@link WORKSHOP_DEFAULT_RESOURCE_FILENAMES}) it is missing —
 * e.g. a draft created before `aoj_transformer.h` was added to the default
 * set. Unlike {@link seedBundledResources}, this only fills gaps: a resource
 * whose name already exists on the draft is left untouched, even if its
 * content is stale, because the author may have edited it and overwriting
 * would destroy that work.
 *
 * Not called from the {@link ensureWorkshopDraft} hot path (every workshop
 * page load) — call it from rarer write operations instead, such as changing
 * the draft's problem type, where an extra resource lookup is cheap relative
 * to the write already happening.
 */
export async function ensureDefaultResourcesSeeded(
	problemId: number,
	userId: number,
	draftId: number
): Promise<void> {
	// Gap check + fill run together under the op-lock so a concurrent rollback
	// can't wipe the prefix between our upload and our row insert.
	const seeded = await withDraftSeedLock(draftId, async () => {
		const existing = await db
			.select({ name: workshopResources.name })
			.from(workshopResources)
			.where(eq(workshopResources.draftId, draftId));
		const existingNames = new Set(existing.map((r) => r.name));
		const missing = WORKSHOP_DEFAULT_RESOURCE_FILENAMES.filter((f) => !existingNames.has(f));

		for (const filename of missing) {
			const content = await readBundledWorkshopResource(filename);
			const path = workshopDraftResourcePath(problemId, userId, filename);
			await uploadFile(path, content, "text/plain");
			await db
				.insert(workshopResources)
				.values({ draftId, name: filename, path })
				.onConflictDoNothing();
		}
	});
	if (!seeded) {
		throw new Error("드래프트 롤백/업데이트가 진행 중입니다. 잠시 후 다시 시도하세요.");
	}
}

/**
 * Seed `icpc_diff.cpp` into the draft's checker slot if and only if
 * `workshopDrafts.checkerPath` is currently null. Safe to call on every
 * draft-ensure roundtrip — the null check is a cheap DB read and the lock is
 * only taken in the rare case a seed is actually needed.
 */
async function ensureDefaultCheckerSeeded(problemId: number, userId: number): Promise<void> {
	const [row] = await db
		.select({ id: workshopDrafts.id, checkerPath: workshopDrafts.checkerPath })
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!row) return;
	if (row.checkerPath) return;
	await withDraftSeedLock(row.id, () => seedDefaultChecker(problemId, userId));
}

/**
 * Unconditional-write half of {@link ensureDefaultCheckerSeeded}. Caller must
 * hold the draft op-lock. Re-reads `checkerPath` under the lock because a
 * rollback that held the lock just before us may have populated it.
 */
async function seedDefaultChecker(problemId: number, userId: number): Promise<void> {
	const [row] = await db
		.select({ checkerPath: workshopDrafts.checkerPath })
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!row || row.checkerPath) return;

	const content = await readBundledCheckerSource(DEFAULT_CHECKER_PRESET);
	const path = workshopDraftCheckerPath(problemId, userId, "cpp");
	await uploadFile(path, content, "text/x-c++src");
	await db
		.update(workshopDrafts)
		.set({ checkerPath: path, checkerLanguage: "cpp", updatedAt: new Date() })
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)));
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
 * the problem, unless `isAdmin` is true — admins bypass membership and get
 * their own draft on any workshop problem. Callers that already checked
 * membership can skip straight to ensureWorkshopDraft.
 */
export async function getActiveDraftForUser(
	problemId: number,
	userId: number,
	isAdmin = false
): Promise<WorkshopDraft> {
	if (!isAdmin) {
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
	}
	return ensureWorkshopDraft(problemId, userId);
}
