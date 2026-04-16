import { and, desc, eq, notLike } from "drizzle-orm";
import { db } from "@/db";
import type {
	WorkshopGenerator,
	WorkshopProblem,
	WorkshopSolution,
	WorkshopTestcase,
} from "@/db/schema";
import {
	users,
	type WorkshopSnapshot,
	workshopDrafts,
	workshopGenerators,
	workshopProblems,
	workshopResources,
	workshopSnapshots,
	workshopSolutions,
	workshopTestcases,
} from "@/db/schema";
import { deleteAllWithPrefix } from "@/lib/storage/operations";
import { languageToFileExtension } from "@/lib/workshop/language-ext";
import { restoreObject, storeAsObjectByKey } from "@/lib/workshop/objects";
import {
	workshopDraftBase,
	workshopDraftCheckerPath,
	workshopDraftGeneratorSourcePath,
	workshopDraftResourcePath,
	workshopDraftSolutionPath,
	workshopDraftTestcasePath,
	workshopDraftValidatorPath,
} from "@/lib/workshop/paths";

/**
 * Shape persisted to `workshopSnapshots.stateJson`. Every MinIO-backed file is
 * referenced by sha256 hex — never inline. Restoring a snapshot re-materializes
 * the draft by copying from `objects/{sha256}` to the draft's paths.
 *
 * `version` is reserved for future schema migrations; for Phase 7 it is always 1.
 */
export const SNAPSHOT_STATE_VERSION = 1 as const;

export type SnapshotProblemHeader = {
	title: string;
	description: string;
	problemType: WorkshopProblem["problemType"];
	timeLimit: number;
	memoryLimit: number;
	seed: string;
	checkerLanguage: string | null;
	checkerHash: string | null;
	validatorLanguage: string | null;
	validatorHash: string | null;
	generatorScript: string | null;
};

export type SnapshotTestcase = {
	index: WorkshopTestcase["index"];
	source: WorkshopTestcase["source"];
	generatorName: string | null;
	generatorArgs: string | null;
	subtaskGroup: number;
	score: number;
	inputHash: string;
	outputHash: string | null;
};

export type SnapshotGenerator = {
	name: string;
	language: WorkshopGenerator["language"];
	sourceHash: string;
	compiledHash: string | null;
};

export type SnapshotSolution = {
	name: string;
	language: WorkshopSolution["language"];
	sourceHash: string;
	expectedVerdict: WorkshopSolution["expectedVerdict"];
	isMain: boolean;
};

export type SnapshotResource = {
	name: string;
	hash: string;
};

export type SnapshotState = {
	version: typeof SNAPSHOT_STATE_VERSION;
	problem: SnapshotProblemHeader;
	testcases: SnapshotTestcase[];
	generators: SnapshotGenerator[];
	solutions: SnapshotSolution[];
	resources: SnapshotResource[];
};

// ---------------------------------------------------------------------------
// createSnapshot
// ---------------------------------------------------------------------------

/**
 * Capture the active draft for `(problemId, userId)` as a new snapshot.
 *
 * Flow:
 *   1. Load problem header + all draft-scoped rows.
 *   2. Content-address every MinIO-backed file in parallel
 *      (testcase inputs/outputs, generator source/compiled, solution source,
 *      resource files, checker/validator sources). Each upload is a HEAD
 *      first (skip on hit), then PUT (on miss).
 *   3. Build the SnapshotState JSON using the hashes.
 *   4. In a single DB transaction, insert the workshopSnapshots row.
 *
 * Returns the new snapshot row. Throws on any MinIO or DB failure — caller
 * should surface the error to the user; partial CAS writes are harmless and
 * will dedup into the next attempt.
 */
export async function createSnapshot(params: {
	problemId: number;
	userId: number;
	label: string;
	message: string | null;
}): Promise<WorkshopSnapshot> {
	const { problemId, userId, label, message } = params;
	if (!label.trim()) throw new Error("라벨을 입력해주세요");

	const [problem] = await db
		.select()
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!problem) throw new Error("문제를 찾을 수 없습니다");

	const [draft] = await db
		.select()
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!draft)
		throw new Error("드래프트가 없습니다 — 먼저 편집 페이지를 열어 드래프트를 생성하세요");

	const [testcases, generators, solutions, resources] = await Promise.all([
		db.select().from(workshopTestcases).where(eq(workshopTestcases.draftId, draft.id)),
		db.select().from(workshopGenerators).where(eq(workshopGenerators.draftId, draft.id)),
		db.select().from(workshopSolutions).where(eq(workshopSolutions.draftId, draft.id)),
		db.select().from(workshopResources).where(eq(workshopResources.draftId, draft.id)),
	]);

	const generatorNameById = new Map<number, string>();
	for (const g of generators) generatorNameById.set(g.id, g.name);

	// --- Phase 7a: content-address every file in parallel --------------------
	const hashJobs: Promise<unknown>[] = [];

	const tcHashes: { index: number; inputHash: string; outputHash: string | null }[] = [];
	for (const t of testcases) {
		const slot: { index: number; inputHash: string; outputHash: string | null } = {
			index: t.index,
			inputHash: "",
			outputHash: null,
		};
		tcHashes.push(slot);
		hashJobs.push(
			storeAsObjectByKey(problemId, t.inputPath).then((h) => {
				slot.inputHash = h;
			})
		);
		if (t.outputPath) {
			const outPath = t.outputPath;
			hashJobs.push(
				storeAsObjectByKey(problemId, outPath).then((h) => {
					slot.outputHash = h;
				})
			);
		}
	}

	const genHashes: { id: number; sourceHash: string; compiledHash: string | null }[] = [];
	for (const g of generators) {
		const slot: { id: number; sourceHash: string; compiledHash: string | null } = {
			id: g.id,
			sourceHash: "",
			compiledHash: null,
		};
		genHashes.push(slot);
		hashJobs.push(
			storeAsObjectByKey(problemId, g.sourcePath).then((h) => {
				slot.sourceHash = h;
			})
		);
		if (g.compiledPath) {
			const cp = g.compiledPath;
			hashJobs.push(
				storeAsObjectByKey(problemId, cp).then((h) => {
					slot.compiledHash = h;
				})
			);
		}
	}

	const solHashes: { id: number; sourceHash: string }[] = [];
	for (const s of solutions) {
		const slot: { id: number; sourceHash: string } = { id: s.id, sourceHash: "" };
		solHashes.push(slot);
		hashJobs.push(
			storeAsObjectByKey(problemId, s.sourcePath).then((h) => {
				slot.sourceHash = h;
			})
		);
	}

	const resHashes: { id: number; hash: string }[] = [];
	for (const r of resources) {
		const slot: { id: number; hash: string } = { id: r.id, hash: "" };
		resHashes.push(slot);
		hashJobs.push(
			storeAsObjectByKey(problemId, r.path).then((h) => {
				slot.hash = h;
			})
		);
	}

	let checkerHash: string | null = null;
	if (problem.checkerPath) {
		const cp = problem.checkerPath;
		hashJobs.push(
			storeAsObjectByKey(problemId, cp).then((h) => {
				checkerHash = h;
			})
		);
	}
	let validatorHash: string | null = null;
	if (problem.validatorPath) {
		const vp = problem.validatorPath;
		hashJobs.push(
			storeAsObjectByKey(problemId, vp).then((h) => {
				validatorHash = h;
			})
		);
	}

	await Promise.all(hashJobs);

	// --- Phase 7b: assemble the stateJson ------------------------------------
	const tcHashByIndex = new Map(tcHashes.map((h) => [h.index, h]));
	const genHashById = new Map(genHashes.map((h) => [h.id, h]));
	const solById = new Map(solHashes.map((h) => [h.id, h]));
	const resById = new Map(resHashes.map((h) => [h.id, h]));

	const state: SnapshotState = {
		version: SNAPSHOT_STATE_VERSION,
		problem: {
			title: problem.title,
			description: problem.description,
			problemType: problem.problemType,
			timeLimit: problem.timeLimit,
			memoryLimit: problem.memoryLimit,
			seed: problem.seed,
			checkerLanguage: problem.checkerLanguage,
			checkerHash,
			validatorLanguage: problem.validatorLanguage,
			validatorHash,
			generatorScript: problem.generatorScript,
		},
		testcases: testcases.map((t) => {
			const h = tcHashByIndex.get(t.index);
			if (!h) throw new Error(`testcase ${t.index} 의 해시 계산 누락`);
			return {
				index: t.index,
				source: t.source,
				generatorName:
					t.generatorId !== null ? (generatorNameById.get(t.generatorId) ?? null) : null,
				generatorArgs: t.generatorArgs,
				subtaskGroup: t.subtaskGroup,
				score: t.score,
				inputHash: h.inputHash,
				outputHash: h.outputHash,
			};
		}),
		generators: generators.map((g) => {
			const h = genHashById.get(g.id);
			if (!h) throw new Error(`generator ${g.name} 의 해시 계산 누락`);
			return {
				name: g.name,
				language: g.language,
				sourceHash: h.sourceHash,
				compiledHash: h.compiledHash,
			};
		}),
		solutions: solutions.map((s) => {
			const h = solById.get(s.id);
			if (!h) throw new Error(`solution ${s.name} 의 해시 계산 누락`);
			return {
				name: s.name,
				language: s.language,
				sourceHash: h.sourceHash,
				expectedVerdict: s.expectedVerdict,
				isMain: s.isMain,
			};
		}),
		resources: resources.map((r) => {
			const h = resById.get(r.id);
			if (!h) throw new Error(`resource ${r.name} 의 해시 계산 누락`);
			return { name: r.name, hash: h.hash };
		}),
	};

	// --- Phase 7c: insert the snapshot row inside a DB transaction ----------
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(workshopSnapshots)
			.values({
				workshopProblemId: problemId,
				label: label.trim(),
				message: message?.trim() || null,
				stateJson: state,
				createdBy: userId,
			})
			.returning();
		// The author's draft now reflects exactly what the snapshot captured,
		// so rebase their baseSnapshotId onto the new snapshot. Teammates'
		// drafts are untouched — they correctly remain "stale" against the
		// new snapshot until they update.
		await tx
			.update(workshopDrafts)
			.set({ baseSnapshotId: row.id })
			.where(eq(workshopDrafts.id, draft.id));
		return row;
	});
}

// ---------------------------------------------------------------------------
// listSnapshots / getSnapshot
// ---------------------------------------------------------------------------

export type SnapshotListItem = {
	id: number;
	label: string;
	message: string | null;
	createdAt: Date;
	createdBy: number;
	createdByName: string;
};

/**
 * Return all snapshots for `problemId`, newest first, with the creator's
 * display name joined in for the list UI.
 */
export async function listSnapshots(problemId: number): Promise<SnapshotListItem[]> {
	const rows = await db
		.select({
			id: workshopSnapshots.id,
			label: workshopSnapshots.label,
			message: workshopSnapshots.message,
			createdAt: workshopSnapshots.createdAt,
			createdBy: workshopSnapshots.createdBy,
			createdByName: users.name,
		})
		.from(workshopSnapshots)
		.innerJoin(users, eq(users.id, workshopSnapshots.createdBy))
		.where(eq(workshopSnapshots.workshopProblemId, problemId))
		.orderBy(desc(workshopSnapshots.createdAt));
	return rows;
}

/**
 * Load one snapshot by id, scoped to `problemId`. Returns null if the snapshot
 * doesn't exist OR doesn't belong to the problem (prevents cross-problem ID
 * probing).
 */
export async function getSnapshot(
	problemId: number,
	snapshotId: number
): Promise<WorkshopSnapshot | null> {
	const [row] = await db
		.select()
		.from(workshopSnapshots)
		.where(
			and(eq(workshopSnapshots.id, snapshotId), eq(workshopSnapshots.workshopProblemId, problemId))
		)
		.limit(1);
	return row ?? null;
}

// ---------------------------------------------------------------------------
// rollbackToSnapshot
// ---------------------------------------------------------------------------

/**
 * Restore `snapshotId` into the active draft for `(problemId, userId)`.
 *
 * Steps (see plan §Task 7 for atomicity rationale):
 *   1. Auto-snapshot the current draft (label = `auto/롤백 전 — ${target.label}`).
 *      This is **mandatory** — if it fails, the rollback aborts.
 *   1b. Wipe pre-existing draft MinIO files so we don't leave orphans (I13).
 *   2. Parallel CopyObject from `objects/{sha256}` back to draft paths.
 *   3. Wipe & re-insert draft rows + update problem header, in one tx.
 *   4. Set `workshopDrafts.baseSnapshotId = target.id`.
 *
 * Known limitation (I12 — DB-failure-after-MinIO-restore, deferred):
 *   If MinIO restore (step 2) succeeds but the DB transaction (step 3) fails,
 *   the draft is left with restored files on MinIO but the OLD DB rows still
 *   referencing the previous (now overwritten) paths. The mandatory auto-
 *   snapshot from step 1 provides the recovery path: the user can re-rollback
 *   to that auto-snapshot, which will re-restore both MinIO and DB to the
 *   pre-rollback state. A truly atomic fix would require staging restored
 *   files to side paths and renaming on tx commit, which is non-trivial on
 *   S3-style storage. Tracked as a follow-up.
 *
 * Returns the re-hydrated draft row.
 */
export async function rollbackToSnapshot(params: {
	problemId: number;
	userId: number;
	snapshotId: number;
	/**
	 * Override the auto-pre-snapshot label. Default: `auto/롤백 전 — {label}`.
	 * Used by `updateDraftToLatest` to disambiguate "update" from "rollback".
	 */
	autoSnapshotLabel?: string;
}): Promise<{ autoSnapshot: WorkshopSnapshot; restored: WorkshopSnapshot }> {
	const { problemId, userId, snapshotId, autoSnapshotLabel } = params;

	const target = await getSnapshot(problemId, snapshotId);
	if (!target) throw new Error("스냅샷을 찾을 수 없습니다");
	const state = target.stateJson as SnapshotState;
	if (!state || state.version !== SNAPSHOT_STATE_VERSION) {
		throw new Error(`스냅샷 포맷 버전이 호환되지 않습니다 (version=${state?.version})`);
	}

	const [draft] = await db
		.select()
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!draft) throw new Error("드래프트가 없습니다");

	// 1. Mandatory auto-pre-snapshot.
	const autoLabel = autoSnapshotLabel ?? `auto/롤백 전 — ${target.label}`;
	const autoSnapshot = await createSnapshot({
		problemId,
		userId,
		label: autoLabel,
		message: `rollback to snapshot #${target.id} (${target.label})`,
	});

	// 1b. Wipe existing draft MinIO files so rollback doesn't leave orphans.
	//     Files in the prior draft state that aren't in the target snapshot
	//     (e.g. solutions added since the snapshot was taken) become unrecoverable —
	//     this is the desired behavior per spec (rollback = "go back to that state").
	//     The mandatory auto-snapshot above (step 1) preserves recovery on user error.
	await deleteAllWithPrefix(`${workshopDraftBase(problemId, userId)}/`);

	// 2. Parallel object restores to draft paths.
	const copyJobs: Promise<unknown>[] = [];

	// 2a. Checker / validator — paths are derived from language → file extension.
	if (state.problem.checkerHash && state.problem.checkerLanguage) {
		const ext = languageToFileExtension(state.problem.checkerLanguage);
		const dest = workshopDraftCheckerPath(problemId, userId, ext);
		copyJobs.push(restoreObject(problemId, state.problem.checkerHash, dest));
	}
	if (state.problem.validatorHash && state.problem.validatorLanguage) {
		const ext = languageToFileExtension(state.problem.validatorLanguage);
		const dest = workshopDraftValidatorPath(problemId, userId, ext);
		copyJobs.push(restoreObject(problemId, state.problem.validatorHash, dest));
	}

	// 2b. Testcases (input + optional output).
	for (const t of state.testcases) {
		copyJobs.push(
			restoreObject(
				problemId,
				t.inputHash,
				workshopDraftTestcasePath(problemId, userId, t.index, "input")
			)
		);
		if (t.outputHash) {
			copyJobs.push(
				restoreObject(
					problemId,
					t.outputHash,
					workshopDraftTestcasePath(problemId, userId, t.index, "output")
				)
			);
		}
	}

	// 2c. Generators — source only (compiled binary is regenerated on next run).
	for (const g of state.generators) {
		const ext = languageToFileExtension(g.language);
		copyJobs.push(
			restoreObject(
				problemId,
				g.sourceHash,
				workshopDraftGeneratorSourcePath(problemId, userId, g.name, ext)
			)
		);
	}

	// 2d. Solutions.
	for (const s of state.solutions) {
		const ext = languageToFileExtension(s.language);
		copyJobs.push(
			restoreObject(
				problemId,
				s.sourceHash,
				workshopDraftSolutionPath(problemId, userId, s.name, ext)
			)
		);
	}

	// 2e. Resources.
	for (const r of state.resources) {
		copyJobs.push(
			restoreObject(problemId, r.hash, workshopDraftResourcePath(problemId, userId, r.name))
		);
	}

	await Promise.all(copyJobs);

	// 3. Replace DB state in one transaction.
	await db.transaction(async (tx) => {
		// Wipe draft-scoped rows (cascades already set draftId FKs to cascade
		// delete from workshopDrafts, but we're keeping the draft row itself).
		await tx.delete(workshopTestcases).where(eq(workshopTestcases.draftId, draft.id));
		await tx.delete(workshopSolutions).where(eq(workshopSolutions.draftId, draft.id));
		await tx.delete(workshopGenerators).where(eq(workshopGenerators.draftId, draft.id));
		await tx.delete(workshopResources).where(eq(workshopResources.draftId, draft.id));

		// Re-insert generators first so testcases can resolve generatorId by name.
		const genNameToId = new Map<string, number>();
		for (const g of state.generators) {
			const ext = languageToFileExtension(g.language);
			const sourcePath = workshopDraftGeneratorSourcePath(problemId, userId, g.name, ext);
			const [row] = await tx
				.insert(workshopGenerators)
				.values({
					draftId: draft.id,
					name: g.name,
					language: g.language,
					sourcePath,
					compiledPath: null, // compiled binary is intentionally NOT restored
				})
				.returning();
			genNameToId.set(g.name, row.id);
		}

		for (const s of state.solutions) {
			const ext = languageToFileExtension(s.language);
			const sourcePath = workshopDraftSolutionPath(problemId, userId, s.name, ext);
			await tx.insert(workshopSolutions).values({
				draftId: draft.id,
				name: s.name,
				language: s.language,
				sourcePath,
				expectedVerdict: s.expectedVerdict,
				isMain: s.isMain,
			});
		}

		for (const r of state.resources) {
			const path = workshopDraftResourcePath(problemId, userId, r.name);
			await tx.insert(workshopResources).values({
				draftId: draft.id,
				name: r.name,
				path,
			});
		}

		for (const t of state.testcases) {
			const inputPath = workshopDraftTestcasePath(problemId, userId, t.index, "input");
			const outputPath = t.outputHash
				? workshopDraftTestcasePath(problemId, userId, t.index, "output")
				: null;
			const generatorId = t.generatorName ? (genNameToId.get(t.generatorName) ?? null) : null;
			await tx.insert(workshopTestcases).values({
				draftId: draft.id,
				index: t.index,
				source: t.source,
				generatorId,
				generatorArgs: t.generatorArgs,
				inputPath,
				outputPath,
				subtaskGroup: t.subtaskGroup,
				score: t.score,
				validationStatus: "pending",
			});
		}

		// Update problem header.
		const checkerPath =
			state.problem.checkerHash && state.problem.checkerLanguage
				? workshopDraftCheckerPath(
						problemId,
						userId,
						languageToFileExtension(state.problem.checkerLanguage)
					)
				: null;
		const validatorPath =
			state.problem.validatorHash && state.problem.validatorLanguage
				? workshopDraftValidatorPath(
						problemId,
						userId,
						languageToFileExtension(state.problem.validatorLanguage)
					)
				: null;
		await tx
			.update(workshopProblems)
			.set({
				title: state.problem.title,
				description: state.problem.description,
				problemType: state.problem.problemType,
				timeLimit: state.problem.timeLimit,
				memoryLimit: state.problem.memoryLimit,
				seed: state.problem.seed,
				checkerLanguage: state.problem.checkerLanguage,
				checkerPath,
				validatorLanguage: state.problem.validatorLanguage,
				validatorPath,
				generatorScript: state.problem.generatorScript,
				updatedAt: new Date(),
			})
			.where(eq(workshopProblems.id, problemId));

		// 4. Set draft's base snapshot and bump updatedAt.
		await tx
			.update(workshopDrafts)
			.set({ baseSnapshotId: target.id, updatedAt: new Date() })
			.where(eq(workshopDrafts.id, draft.id));
	});

	return { autoSnapshot, restored: target };
}

// ---------------------------------------------------------------------------
// detectStaleDraft / updateDraftToLatest
// ---------------------------------------------------------------------------

/**
 * Check if the user's draft is based on an outdated snapshot.
 *
 * "Latest" means the most recent USER-COMMITTED snapshot — auto-snapshots
 * (label prefix `auto/`, created by rollback / update) are excluded so an
 * update operation does not immediately re-flag itself as stale.
 *
 * Returns null if up-to-date, or {baseSnapshotId, latestSnapshotId, latestLabel} if stale.
 */
export async function detectStaleDraft(params: { problemId: number; userId: number }): Promise<{
	baseSnapshotId: number | null;
	latestSnapshotId: number;
	latestLabel: string;
} | null> {
	// Get the user's draft.
	const [draft] = await db
		.select()
		.from(workshopDrafts)
		.where(
			and(
				eq(workshopDrafts.workshopProblemId, params.problemId),
				eq(workshopDrafts.userId, params.userId)
			)
		)
		.limit(1);
	if (!draft) return null;

	// Get latest USER-COMMITTED snapshot (exclude `auto/...` system snapshots).
	const [latest] = await db
		.select({ id: workshopSnapshots.id, label: workshopSnapshots.label })
		.from(workshopSnapshots)
		.where(
			and(
				eq(workshopSnapshots.workshopProblemId, params.problemId),
				notLike(workshopSnapshots.label, "auto/%")
			)
		)
		.orderBy(desc(workshopSnapshots.id))
		.limit(1);
	if (!latest) return null; // no user-committed snapshots yet

	if (draft.baseSnapshotId === latest.id) return null;
	return {
		baseSnapshotId: draft.baseSnapshotId,
		latestSnapshotId: latest.id,
		latestLabel: latest.label,
	};
}

/**
 * Update the user's draft to the latest snapshot, with a pre-update auto-snapshot.
 * Equivalent to "rollback to latest snapshot" with the auto-snapshot label
 * disambiguated as "auto/update 전 — {latest label}".
 *
 * Throws if there is no snapshot at all, or if the draft is already up-to-date.
 */
export async function updateDraftToLatest(params: {
	problemId: number;
	userId: number;
}): Promise<{ autoSnapshot: WorkshopSnapshot; restored: WorkshopSnapshot }> {
	const stale = await detectStaleDraft(params);
	if (!stale) {
		throw new Error("이미 최신 스냅샷 기반입니다");
	}
	return rollbackToSnapshot({
		problemId: params.problemId,
		userId: params.userId,
		snapshotId: stale.latestSnapshotId,
		autoSnapshotLabel: `auto/update 전 — ${stale.latestLabel}`,
	});
}
