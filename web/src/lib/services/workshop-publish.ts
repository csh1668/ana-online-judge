import { and, desc, eq, isNull, notLike } from "drizzle-orm";
import { db } from "@/db";
import type { Language, Translations } from "@/db/schema";
import {
	problemAuthors,
	problems,
	testcases,
	workshopProblemMembers,
	workshopProblems,
	workshopSnapshots,
} from "@/db/schema";
import { getFileExtension } from "@/lib/languages";
import { recomputeProblemSubtaskMeta } from "@/lib/services/problem-subtask-meta";
import {
	migrateWorkshopImages,
	rewriteWorkshopImageUrls,
} from "@/lib/services/workshop-publish-images";
import { computePublishReadiness } from "@/lib/services/workshop-publish-readiness";
import { copyObject, deleteFile, listObjects } from "@/lib/storage/operations";
import {
	generateProblemBasePath,
	generateVersionedCheckerPath,
	generateVersionedTestcasePath,
	generateVersionedValidatorPath,
} from "@/lib/storage/paths";
import { nowIso } from "@/lib/utils/translations";
import { publishLockKey, withWorkshopLock } from "@/lib/workshop/op-lock";
import { workshopObjectPath } from "@/lib/workshop/paths";
import type { WorkshopSnapshotStateJson } from "@/lib/workshop/snapshot-contract";

export interface PublishOptions {
	workshopProblemId: number;
}

export interface PublishResult {
	problemId: number;
	mode: "created" | "updated";
}

/** Publishing copies every artifact object, so allow a generous lock window. */
const PUBLISH_LOCK_TTL_SEC = 300;

/**
 * Resolve the latest committed snapshot for a workshop problem.
 * Returns the row + parsed stateJson. Throws if none.
 */
async function loadLatestSnapshot(workshopProblemId: number) {
	const [row] = await db
		.select()
		.from(workshopSnapshots)
		.where(
			and(
				eq(workshopSnapshots.workshopProblemId, workshopProblemId),
				notLike(workshopSnapshots.label, "auto/%")
			)
		)
		.orderBy(desc(workshopSnapshots.id))
		.limit(1);
	if (!row) {
		throw new Error("커밋된 스냅샷이 없습니다.");
	}
	return { row, state: row.stateJson as WorkshopSnapshotStateJson };
}

/**
 * Throw with a joined issue message if readiness is not green.
 */
async function assertReady(workshopProblemId: number): Promise<void> {
	const r = await computePublishReadiness(workshopProblemId);
	if (!r.ready) {
		throw new Error(`출판 준비 미완료:\n${r.issues.map((i) => `- ${i.message}`).join("\n")}`);
	}
}

/**
 * Compute the maxScore from snapshot testcases. Subtask problems (distinct
 * subtaskGroup > 1) use Σ tc.score; non-subtask problems default to 100.
 */
function computeMaxScore(state: WorkshopSnapshotStateJson): number {
	const groups = new Set<number>();
	let sum = 0;
	for (const t of state.testcases) {
		groups.add(t.subtaskGroup ?? 0);
		sum += t.score ?? 0;
	}
	if (groups.size > 1) return sum > 0 ? sum : 100;
	return 100;
}

interface VersionedArtifacts {
	/** Destination keys per testcase, index-aligned with `state.testcases`. */
	testcasePaths: { inputPath: string; outputPath: string }[];
	checkerPath: string;
	validatorPath: string | null;
}

/**
 * Copy the snapshot's testcases/checker/validator into the version-scoped
 * prefixes of `problemId`. Nothing here touches an unversioned (or older
 * version) key, so the currently published files stay byte-for-byte intact
 * until the swap transaction commits.
 *
 * Every destination key is appended to the caller-owned `copiedKeys` as soon as
 * it is written, so a throw partway through still leaves the caller holding the
 * exact list of objects to clean up.
 */
async function copyVersionedArtifacts(
	workshopProblemId: number,
	problemId: number,
	version: number,
	state: WorkshopSnapshotStateJson,
	copiedKeys: string[]
): Promise<VersionedArtifacts> {
	const testcasePaths: { inputPath: string; outputPath: string }[] = [];

	for (let i = 0; i < state.testcases.length; i++) {
		const tc = state.testcases[i];
		const targetIndex = i + 1;
		if (!tc.outputHash) {
			throw new Error(`테스트케이스 ${tc.index}에 정답이 없습니다.`);
		}

		const inputPath = generateVersionedTestcasePath(problemId, version, targetIndex, "input");
		await copyObject(workshopObjectPath(workshopProblemId, tc.inputHash), inputPath);
		copiedKeys.push(inputPath);

		const outputPath = generateVersionedTestcasePath(problemId, version, targetIndex, "output");
		await copyObject(workshopObjectPath(workshopProblemId, tc.outputHash), outputPath);
		copiedKeys.push(outputPath);

		testcasePaths.push({ inputPath, outputPath });
	}

	// Checker (required).
	if (!state.problem.checkerHash || !state.problem.checkerLanguage) {
		throw new Error("체커가 설정되어 있지 않습니다.");
	}
	const checkerExt = getFileExtension(state.problem.checkerLanguage as Language);
	const checkerPath = generateVersionedCheckerPath(problemId, version, `main.${checkerExt}`);
	await copyObject(workshopObjectPath(workshopProblemId, state.problem.checkerHash), checkerPath);
	copiedKeys.push(checkerPath);

	// Validator (optional).
	let validatorPath: string | null = null;
	if (state.problem.validatorHash && state.problem.validatorLanguage) {
		const validatorExt = getFileExtension(state.problem.validatorLanguage as Language);
		validatorPath = generateVersionedValidatorPath(problemId, version, `main.${validatorExt}`);
		await copyObject(
			workshopObjectPath(workshopProblemId, state.problem.validatorHash),
			validatorPath
		);
		copiedKeys.push(validatorPath);
	}

	return { testcasePaths, checkerPath, validatorPath };
}

/**
 * Version-scoped artifact sub-prefixes. Post-publish sweeps must stay inside
 * these — the rest of `problems/{id}/` holds admin-owned objects (anigma
 * reference/solution zips, external_files) that no publish ever writes.
 */
const VERSIONED_ARTIFACT_SUBPREFIXES = ["testcases/", "checker/", "validator/"] as const;

/** Best-effort deletion of every key under `prefix` that `keep` does not cover. */
async function deleteUnreferencedKeys(prefix: string, keep: Set<string>): Promise<void> {
	const allKeys = await listObjects(prefix);
	for (const key of allKeys) {
		if (keep.has(key)) continue;
		try {
			await deleteFile(key);
		} catch {
			// best-effort — an orphan object is harmless, a failed publish is not
		}
	}
}

async function bestEffortDelete(keys: string[]): Promise<void> {
	for (const key of keys) {
		try {
			await deleteFile(key);
		} catch (delErr) {
			console.error(`[workshop-publish] cleanup delete failed for ${key}:`, delErr);
		}
	}
}

/**
 * Publish the latest committed snapshot of a workshop problem as a NEW
 * `problems` row. Throws if the problem is already published.
 */
export async function publishWorkshopAsNewProblem(opts: PublishOptions): Promise<PublishResult> {
	const { workshopProblemId } = opts;
	return withWorkshopLock(publishLockKey(workshopProblemId), PUBLISH_LOCK_TTL_SEC, () =>
		publishAsNewProblemLocked(workshopProblemId)
	);
}

async function publishAsNewProblemLocked(workshopProblemId: number): Promise<PublishResult> {
	const [wp] = await db
		.select()
		.from(workshopProblems)
		.where(eq(workshopProblems.id, workshopProblemId))
		.limit(1);
	if (!wp) throw new Error("창작마당 문제를 찾을 수 없습니다.");
	if (wp.publishedProblemId !== null) {
		throw new Error(
			"이미 출판된 문제입니다. 재출판이 필요하면 republishWorkshopToExistingProblem을 사용하세요."
		);
	}

	await assertReady(workshopProblemId);
	const { row: snapRow, state } = await loadLatestSnapshot(workshopProblemId);

	// 1) Create the problems row first so we have an id for file paths.
	const initialNow = nowIso();
	const initialTranslations: Translations = {
		original: "ko",
		entries: {
			ko: {
				title: state.problem.title,
				content: "(publish in progress)",
				createdAt: initialNow,
				updatedAt: initialNow,
			},
		},
	};
	const [newProblem] = await db
		.insert(problems)
		.values({
			translations: initialTranslations,
			timeLimit: state.problem.timeLimit,
			memoryLimit: state.problem.memoryLimit,
			maxScore: computeMaxScore(state),
			isPublic: false,
			judgeAvailable: true,
			problemType: state.problem.problemType === "special_judge" ? "special_judge" : "icpc",
			inputMethod: "stdin",
			allowedLanguages: null,
		})
		.returning();

	const copiedKeys: string[] = [];
	let swapped = false;

	try {
		// 2) Copy testcases + checker + validator under v{snapshotId}/.
		const artifacts = await copyVersionedArtifacts(
			workshopProblemId,
			newProblem.id,
			snapRow.id,
			state,
			copiedKeys
		);

		// 3) Migrate inline images + rewrite markdown.
		const imageResult = await migrateWorkshopImages(workshopProblemId, newProblem.id);
		copiedKeys.push(...imageResult.copiedKeys);

		const rewrittenContent = rewriteWorkshopImageUrls(
			state.problem.description,
			workshopProblemId,
			newProblem.id
		);

		// 4) DB writes in a single transaction.
		await db.transaction(async (tx) => {
			const finalNow = nowIso();
			const finalTranslations: Translations = {
				original: "ko",
				entries: {
					ko: {
						title: state.problem.title,
						content: rewrittenContent,
						createdAt: initialNow,
						updatedAt: finalNow,
					},
				},
			};

			// 4a. Update translations with rewritten markdown + versioned paths.
			await tx
				.update(problems)
				.set({
					translations: finalTranslations,
					checkerPath: artifacts.checkerPath,
					validatorPath: artifacts.validatorPath,
					updatedAt: new Date(),
				})
				.where(eq(problems.id, newProblem.id));

			// 4b. Insert testcases rows pointing at the versioned keys.
			for (let i = 0; i < state.testcases.length; i++) {
				const tc = state.testcases[i];
				const paths = artifacts.testcasePaths[i];
				await tx.insert(testcases).values({
					problemId: newProblem.id,
					inputPath: paths.inputPath,
					outputPath: paths.outputPath,
					subtaskGroup: tc.subtaskGroup,
					score: tc.score,
					isHidden: true,
				});
			}

			// 4c. Auto-populate 출제자 from current workshop members (all roles).
			const memberRows = await tx
				.select({ userId: workshopProblemMembers.userId })
				.from(workshopProblemMembers)
				.where(eq(workshopProblemMembers.workshopProblemId, workshopProblemId));
			if (memberRows.length > 0) {
				await tx
					.insert(problemAuthors)
					.values(memberRows.map((m) => ({ problemId: newProblem.id, userId: m.userId })))
					.onConflictDoNothing();
			}

			// 4d. Link publishedProblemId — conditional so a racing publish that
			//     already linked this workshop problem cannot produce a second
			//     live problem row. Losing here rolls the whole tx back and the
			//     catch below removes this attempt's problem row + files.
			const linked = await tx
				.update(workshopProblems)
				.set({
					publishedProblemId: newProblem.id,
					publishedSnapshotId: snapRow.id,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(workshopProblems.id, workshopProblemId),
						isNull(workshopProblems.publishedProblemId)
					)
				)
				.returning({ id: workshopProblems.id });
			if (linked.length === 0) {
				throw new Error("이미 다른 출판이 완료되었습니다. 페이지를 새로고침하세요.");
			}
		});
		swapped = true;

		await recomputeProblemSubtaskMeta(newProblem.id);

		return { problemId: newProblem.id, mode: "created" };
	} catch (err) {
		console.error("[workshop-publish] publish failed, rolling back:", err);
		// Once the tx committed, the problem row + its files are live: a later
		// failure (e.g. subtask meta recompute) must never undo them.
		if (swapped) throw err;

		// Rollback: delete copied S3 keys + the initial problems row. Every key
		// here belongs to this attempt only — the problem row is brand new, so
		// nothing else can reference them.
		await bestEffortDelete(copiedKeys);
		try {
			await db.delete(problems).where(eq(problems.id, newProblem.id));
		} catch (delErr) {
			console.error("[workshop-publish] rollback problem row delete failed:", delErr);
		}
		throw err;
	}
}

/**
 * Re-publish: keep `problems.id` and swap it onto the latest committed
 * snapshot. Everything is copied under `v{snapshotId}/` first, then a single
 * transaction repoints the testcase rows + checker/validator columns, so the
 * currently live files are never written to or deleted before the commit.
 */
export async function republishWorkshopToExistingProblem(
	opts: PublishOptions
): Promise<PublishResult> {
	const { workshopProblemId } = opts;
	return withWorkshopLock(publishLockKey(workshopProblemId), PUBLISH_LOCK_TTL_SEC, () =>
		republishToExistingProblemLocked(workshopProblemId)
	);
}

async function republishToExistingProblemLocked(workshopProblemId: number): Promise<PublishResult> {
	const [wp] = await db
		.select()
		.from(workshopProblems)
		.where(eq(workshopProblems.id, workshopProblemId))
		.limit(1);
	if (!wp) throw new Error("창작마당 문제를 찾을 수 없습니다.");
	if (wp.publishedProblemId === null) {
		throw new Error(
			"이 문제는 아직 출판된 적이 없습니다. publishWorkshopAsNewProblem을 사용하세요."
		);
	}
	const publishedId = wp.publishedProblemId;

	const [existingProblem] = await db
		.select({ id: problems.id })
		.from(problems)
		.where(eq(problems.id, publishedId))
		.limit(1);
	if (!existingProblem) {
		throw new Error(
			`publishedProblemId=${publishedId}가 가리키는 problems row가 없습니다. 새로 출판하세요.`
		);
	}

	await assertReady(workshopProblemId);
	const { row: snapRow, state } = await loadLatestSnapshot(workshopProblemId);
	const version = snapRow.id;

	// Re-publishing the snapshot that is already live rewrites the very same
	// version keys with byte-identical CAS content (harmless), but it also means
	// this attempt's keys ARE the live keys — so failure cleanup must skip them.
	const targetIsLiveVersion = wp.publishedSnapshotId === version;

	const oldProblemPrefix = `${generateProblemBasePath(publishedId)}/`;
	const oldImagePrefix = `images/problems/${publishedId}/`;

	// Owned by this scope so a partial copy is still fully known to the catch.
	const versionedKeys: string[] = [];
	let swapped = false;

	try {
		// 1) Copy every artifact under v{version}/ — no live key is touched.
		const artifacts = await copyVersionedArtifacts(
			workshopProblemId,
			publishedId,
			version,
			state,
			versionedKeys
		);

		// 2) Re-migrate images + rewrite markdown (unversioned, overwrite in place).
		const imageResult = await migrateWorkshopImages(workshopProblemId, publishedId);

		const rewrittenContent = rewriteWorkshopImageUrls(
			state.problem.description,
			workshopProblemId,
			publishedId
		);

		// 3) Atomic swap: repoint testcase rows + problem columns at the new version.
		await db.transaction(async (tx) => {
			await tx.delete(testcases).where(eq(testcases.problemId, publishedId));

			// Merge the Korean translation on top of existing translations so any
			// other-language entries already authored on this problem are preserved.
			const [existing] = await tx
				.select({ translations: problems.translations })
				.from(problems)
				.where(eq(problems.id, publishedId))
				.limit(1);
			if (!existing) throw new Error("Problem not found during republish");
			const prev = existing.translations as Translations;

			const now = nowIso();
			const merged: Translations = {
				original: prev.original,
				entries: {
					...prev.entries,
					ko: {
						title: state.problem.title,
						content: rewrittenContent,
						translatorId: prev.entries.ko?.translatorId ?? null,
						createdAt: prev.entries.ko?.createdAt ?? now,
						updatedAt: now,
					},
				},
			};

			await tx
				.update(problems)
				.set({
					translations: merged,
					timeLimit: state.problem.timeLimit,
					memoryLimit: state.problem.memoryLimit,
					maxScore: computeMaxScore(state),
					problemType: state.problem.problemType === "special_judge" ? "special_judge" : "icpc",
					checkerPath: artifacts.checkerPath,
					validatorPath: artifacts.validatorPath,
					updatedAt: new Date(),
				})
				.where(eq(problems.id, publishedId));

			for (let i = 0; i < state.testcases.length; i++) {
				const tc = state.testcases[i];
				const paths = artifacts.testcasePaths[i];
				await tx.insert(testcases).values({
					problemId: publishedId,
					inputPath: paths.inputPath,
					outputPath: paths.outputPath,
					subtaskGroup: tc.subtaskGroup,
					score: tc.score,
					isHidden: true,
				});
			}

			await tx
				.update(workshopProblems)
				.set({ publishedSnapshotId: version, updatedAt: new Date() })
				.where(eq(workshopProblems.id, workshopProblemId));
		});
		swapped = true;

		await recomputeProblemSubtaskMeta(publishedId);

		// 4) Post-commit cleanup. Only now are the previous version's artifacts
		//    unreferenced; the version directories make that set exact. The sweep
		//    stays inside the artifact sub-prefixes so admin-owned objects
		//    elsewhere under problems/{id}/ (anigma zips, external_files) survive.
		try {
			const keep = new Set(versionedKeys);
			for (const sub of VERSIONED_ARTIFACT_SUBPREFIXES) {
				await deleteUnreferencedKeys(`${oldProblemPrefix}${sub}`, keep);
			}
			await deleteUnreferencedKeys(oldImagePrefix, new Set(imageResult.copiedKeys));
		} catch (cleanupErr) {
			console.warn("[workshop-publish] best-effort orphan cleanup failed:", cleanupErr);
		}

		return { problemId: publishedId, mode: "updated" };
	} catch (err) {
		console.error("[workshop-publish] republish failed:", err);
		// The live problem is untouched: its DB rows still point at the previous
		// version's keys, which this attempt never wrote to. Clean up only the
		// keys of THIS version — unless they are already the live ones (same
		// snapshot re-published, or the swap committed and a later step threw).
		if (!swapped && !targetIsLiveVersion) {
			await bestEffortDelete(versionedKeys);
		}
		throw err;
	}
}
