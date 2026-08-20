import { and, desc, eq, notLike } from "drizzle-orm";
import { db } from "@/db";
import type {
	Language,
	WorkshopDraft,
	WorkshopGenerator,
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
import { getFileExtension } from "@/lib/languages";
import { deleteAllWithPrefix, downloadFile } from "@/lib/storage/operations";
import { restoreObject, storeAsObject, storeAsObjectByKey } from "@/lib/workshop/objects";
import {
	workshopDraftBase,
	workshopDraftCheckerPath,
	workshopDraftGeneratorSourcePath,
	workshopDraftResourcePath,
	workshopDraftSolutionPath,
	workshopDraftTestcaseFilePath,
	workshopDraftValidatorPath,
} from "@/lib/workshop/paths";
import { extractWorkshopImageKeys } from "@/lib/workshop/snapshot-images";

/**
 * Shape persisted to `workshopSnapshots.stateJson`. Every MinIO-backed file is
 * referenced by sha256 hex — never inline. Restoring a snapshot re-materializes
 * the draft by copying from `objects/{sha256}` to the draft's paths.
 *
 * `version` gates schema migrations. v2 (current) adds `testcases[].validationStatus`
 * and `images`. v1 snapshots remain rollback-compatible (missing fields default).
 */
export const SNAPSHOT_STATE_VERSION = 2 as const;

export type SnapshotProblemHeader = {
	title: string;
	description: string;
	problemType: WorkshopDraft["problemType"];
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
	/** v2+. v1 스냅샷에는 없음 → 복원 시 "pending" 폴백. */
	validationStatus?: WorkshopTestcase["validationStatus"];
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

export type SnapshotImage = {
	/** 스토리지 키: images/workshopProblems/{id}/{file} */
	key: string;
	hash: string;
};

export type SnapshotState = {
	version: typeof SNAPSHOT_STATE_VERSION;
	problem: SnapshotProblemHeader;
	testcases: SnapshotTestcase[];
	generators: SnapshotGenerator[];
	solutions: SnapshotSolution[];
	resources: SnapshotResource[];
	/** v2+. 지문 이미지 동결. v1 스냅샷에는 없음. */
	images?: SnapshotImage[];
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
	if (draft.checkerPath) {
		const cp = draft.checkerPath;
		hashJobs.push(
			storeAsObjectByKey(problemId, cp).then((h) => {
				checkerHash = h;
			})
		);
	}
	let validatorHash: string | null = null;
	if (draft.validatorPath) {
		const vp = draft.validatorPath;
		hashJobs.push(
			storeAsObjectByKey(problemId, vp).then((h) => {
				validatorHash = h;
			})
		);
	}

	await Promise.all(hashJobs);

	// 지문 이미지 동결: description의 워크샵 이미지를 CAS로.
	const imageKeys = extractWorkshopImageKeys(draft.description, problemId);
	const images: SnapshotImage[] = [];
	for (const key of imageKeys) {
		try {
			const bytes = await downloadFile(key);
			const hash = await storeAsObject(problemId, bytes);
			images.push({ key, hash });
		} catch (err) {
			console.warn(`[workshop-snapshots] image freeze failed for ${key}:`, err);
		}
	}

	// --- Phase 7b: assemble the stateJson ------------------------------------
	const tcHashByIndex = new Map(tcHashes.map((h) => [h.index, h]));
	const genHashById = new Map(genHashes.map((h) => [h.id, h]));
	const solById = new Map(solHashes.map((h) => [h.id, h]));
	const resById = new Map(resHashes.map((h) => [h.id, h]));

	const state: SnapshotState = {
		version: SNAPSHOT_STATE_VERSION,
		problem: {
			title: draft.title,
			description: draft.description,
			problemType: draft.problemType,
			timeLimit: draft.timeLimit,
			memoryLimit: draft.memoryLimit,
			seed: draft.seed,
			checkerLanguage: draft.checkerLanguage,
			checkerHash,
			validatorLanguage: draft.validatorLanguage,
			validatorHash,
			generatorScript: draft.generatorScript,
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
				validationStatus: t.validationStatus,
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
		images,
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
		// Bump the shared problem's activity timestamp on user-committed snapshots
		// so list/admin/group views (ordered by workshopProblems.updatedAt) surface
		// recently-committed problems. Private draft edits intentionally do NOT
		// reorder the shared list (per-draft isolation); a commit is the canonical
		// "activity" event. Skip `auto/` system snapshots (rollback/update backups).
		if (!label.trim().startsWith("auto/")) {
			await tx
				.update(workshopProblems)
				.set({ updatedAt: new Date() })
				.where(eq(workshopProblems.id, problemId));
		}
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
 * Steps (DB-first ordering for atomicity):
 *   1. Auto-snapshot the current draft (label = `auto/롤백 전 — ${target.label}`).
 *      This is **mandatory** — if it fails, the rollback aborts.
 *   2. Wipe & re-insert draft rows + update header + set `baseSnapshotId`, in one tx.
 *   3. Wipe pre-existing draft MinIO files so we don't leave orphans.
 *   4. Parallel CopyObject from `objects/{sha256}` back to draft paths (incl. images).
 *
 * Atomicity (I12 resolved): the DB transaction runs BEFORE any MinIO mutation.
 * All draft file paths are computed deterministically (problemId/userId/name/index),
 * not read from disk, so files are re-materialized after the tx commits. If the tx
 * fails, no MinIO file is wiped or restored → the draft is fully preserved (clean
 * failure). If a later file restore fails post-commit, the mandatory auto-snapshot
 * (step 1) still provides a re-rollback recovery path.
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
	if (
		!state ||
		typeof state.version !== "number" ||
		state.version < 1 ||
		state.version > SNAPSHOT_STATE_VERSION
	) {
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

	// Run the DB transaction FIRST. All draft file paths below are derived
	// deterministically (problemId/userId/name/index), not read from disk, so we can
	// re-materialize the files afterward. If the tx fails, we abort before touching
	// any MinIO file → the draft's files are fully preserved (clean failure). (I12)
	//
	// 2. Replace DB state in one transaction.
	const restoredTestcases: {
		id: number;
		inputPath: string;
		outputPath: string | null;
		inputHash: string;
		outputHash: string | null;
	}[] = [];
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
			const ext = getFileExtension(g.language);
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
			const ext = getFileExtension(s.language);
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
			const generatorId = t.generatorName ? (genNameToId.get(t.generatorName) ?? null) : null;
			const [row] = await tx
				.insert(workshopTestcases)
				.values({
					draftId: draft.id,
					index: t.index,
					source: t.source,
					generatorId,
					generatorArgs: t.generatorArgs,
					inputPath: "",
					outputPath: null,
					subtaskGroup: t.subtaskGroup,
					score: t.score,
					validationStatus: t.validationStatus ?? "pending",
				})
				.returning();
			const inputPath = workshopDraftTestcaseFilePath(problemId, userId, row.id, "input");
			const outputPath = t.outputHash
				? workshopDraftTestcaseFilePath(problemId, userId, row.id, "output")
				: null;
			await tx
				.update(workshopTestcases)
				.set({ inputPath, outputPath })
				.where(eq(workshopTestcases.id, row.id));
			restoredTestcases.push({
				id: row.id,
				inputPath,
				outputPath,
				inputHash: t.inputHash,
				outputHash: t.outputHash,
			});
		}

		// Update problem header.
		const checkerPath =
			state.problem.checkerHash && state.problem.checkerLanguage
				? workshopDraftCheckerPath(
						problemId,
						userId,
						getFileExtension(state.problem.checkerLanguage as Language)
					)
				: null;
		const validatorPath =
			state.problem.validatorHash && state.problem.validatorLanguage
				? workshopDraftValidatorPath(
						problemId,
						userId,
						getFileExtension(state.problem.validatorLanguage as Language)
					)
				: null;
		await tx
			.update(workshopDrafts)
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
			.where(eq(workshopDrafts.id, draft.id));

		// 2b. Set draft's base snapshot and bump updatedAt.
		await tx
			.update(workshopDrafts)
			.set({ baseSnapshotId: target.id, updatedAt: new Date() })
			.where(eq(workshopDrafts.id, draft.id));
	});

	// 3. Wipe existing draft MinIO files so rollback doesn't leave orphans.
	//     Files in the prior draft state that aren't in the target snapshot
	//     (e.g. solutions added since the snapshot was taken) become unrecoverable —
	//     this is the desired behavior per spec (rollback = "go back to that state").
	//     The mandatory auto-snapshot above (step 1) preserves recovery on user error.
	await deleteAllWithPrefix(`${workshopDraftBase(problemId, userId)}/`);

	// 4. Parallel object restores to draft paths.
	const copyJobs: Promise<unknown>[] = [];

	// 4a. Checker / validator — paths are derived from language → file extension.
	if (state.problem.checkerHash && state.problem.checkerLanguage) {
		const ext = getFileExtension(state.problem.checkerLanguage as Language);
		const dest = workshopDraftCheckerPath(problemId, userId, ext);
		copyJobs.push(restoreObject(problemId, state.problem.checkerHash, dest));
	}
	if (state.problem.validatorHash && state.problem.validatorLanguage) {
		const ext = getFileExtension(state.problem.validatorLanguage as Language);
		const dest = workshopDraftValidatorPath(problemId, userId, ext);
		copyJobs.push(restoreObject(problemId, state.problem.validatorHash, dest));
	}

	// 4b. Testcases (input + optional output).
	for (const rt of restoredTestcases) {
		copyJobs.push(restoreObject(problemId, rt.inputHash, rt.inputPath));
		if (rt.outputHash && rt.outputPath) {
			copyJobs.push(restoreObject(problemId, rt.outputHash, rt.outputPath));
		}
	}

	// 4c. Generators — source only (compiled binary is regenerated on next run).
	for (const g of state.generators) {
		const ext = getFileExtension(g.language);
		copyJobs.push(
			restoreObject(
				problemId,
				g.sourceHash,
				workshopDraftGeneratorSourcePath(problemId, userId, g.name, ext)
			)
		);
	}

	// 4d. Solutions.
	for (const s of state.solutions) {
		const ext = getFileExtension(s.language);
		copyJobs.push(
			restoreObject(
				problemId,
				s.sourceHash,
				workshopDraftSolutionPath(problemId, userId, s.name, ext)
			)
		);
	}

	// 4e. Resources.
	for (const r of state.resources) {
		copyJobs.push(
			restoreObject(problemId, r.hash, workshopDraftResourcePath(problemId, userId, r.name))
		);
	}

	await Promise.all(copyJobs);

	// 4f. 지문 이미지 복원: 삭제됐더라도 동결된 객체에서 원래 키로 되살린다.
	for (const img of state.images ?? []) {
		try {
			await restoreObject(problemId, img.hash, img.key);
		} catch (err) {
			console.warn(`[workshop-snapshots] image restore failed for ${img.key}:`, err);
		}
	}

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
