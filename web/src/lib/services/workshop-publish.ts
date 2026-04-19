import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import type { Translations } from "@/db/schema";
import { problems, testcases, workshopProblems, workshopSnapshots } from "@/db/schema";
import {
	migrateWorkshopImages,
	rewriteWorkshopImageUrls,
} from "@/lib/services/workshop-publish-images";
import { computePublishReadiness } from "@/lib/services/workshop-publish-readiness";
import { copyObject, deleteFile, listObjects } from "@/lib/storage/operations";
import {
	generateCheckerPath,
	generateProblemBasePath,
	generateTestcasePath,
	generateValidatorPath,
} from "@/lib/storage/paths";
import { nowIso } from "@/lib/utils/translations";
import { workshopObjectPath } from "@/lib/workshop/paths";
import type { WorkshopSnapshotStateJson } from "@/lib/workshop/snapshot-contract";

export interface PublishOptions {
	workshopProblemId: number;
}

export interface PublishResult {
	problemId: number;
	mode: "created" | "updated";
}

/**
 * Resolve the latest committed snapshot for a workshop problem.
 * Returns the row + parsed stateJson. Throws if none.
 */
async function loadLatestSnapshot(workshopProblemId: number) {
	const [row] = await db
		.select()
		.from(workshopSnapshots)
		.where(eq(workshopSnapshots.workshopProblemId, workshopProblemId))
		.orderBy(desc(workshopSnapshots.createdAt))
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
 * Language -> filename extension for checker/validator files on the published
 * side.
 */
function extensionForLanguage(language: string): string {
	switch (language) {
		case "cpp":
		case "c++":
			return "cpp";
		case "c":
			return "c";
		case "python":
		case "py":
			return "py";
		case "rust":
			return "rs";
		case "go":
			return "go";
		case "java":
			return "java";
		case "javascript":
		case "js":
			return "js";
		default:
			throw new Error(`알 수 없는 체커/밸리데이터 언어: ${language}`);
	}
}

/**
 * Compute the maxScore from snapshot testcases (sum), defaulting to 100.
 */
function computeMaxScore(state: WorkshopSnapshotStateJson): number {
	const sum = state.testcases.reduce((acc, t) => acc + (t.score ?? 0), 0);
	return sum > 0 ? sum : 100;
}

/**
 * Publish the latest committed snapshot of a workshop problem as a NEW
 * `problems` row. Throws if the problem is already published.
 */
export async function publishWorkshopAsNewProblem(opts: PublishOptions): Promise<PublishResult> {
	const { workshopProblemId } = opts;

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
	const { state } = await loadLatestSnapshot(workshopProblemId);

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

	try {
		// 2) Copy testcase input/output objects.
		for (let i = 0; i < state.testcases.length; i++) {
			const tc = state.testcases[i];
			const targetIndex = i + 1;
			const inputFrom = workshopObjectPath(workshopProblemId, tc.inputHash);
			const inputTo = generateTestcasePath(newProblem.id, targetIndex, "input");
			await copyObject(inputFrom, inputTo);
			copiedKeys.push(inputTo);

			if (!tc.outputHash) {
				throw new Error(`테스트케이스 ${tc.index}에 정답이 없습니다.`);
			}
			const outputFrom = workshopObjectPath(workshopProblemId, tc.outputHash);
			const outputTo = generateTestcasePath(newProblem.id, targetIndex, "output");
			await copyObject(outputFrom, outputTo);
			copiedKeys.push(outputTo);
		}

		// 3) Copy checker (required).
		if (!state.problem.checkerHash || !state.problem.checkerLanguage) {
			throw new Error("체커가 설정되어 있지 않습니다.");
		}
		const checkerExt = extensionForLanguage(state.problem.checkerLanguage);
		const checkerFrom = workshopObjectPath(workshopProblemId, state.problem.checkerHash);
		const checkerTo = generateCheckerPath(newProblem.id, `main.${checkerExt}`);
		await copyObject(checkerFrom, checkerTo);
		copiedKeys.push(checkerTo);

		// 4) Copy validator (optional).
		let validatorTo: string | null = null;
		if (state.problem.validatorHash && state.problem.validatorLanguage) {
			const validatorExt = extensionForLanguage(state.problem.validatorLanguage);
			const validatorFrom = workshopObjectPath(workshopProblemId, state.problem.validatorHash);
			validatorTo = generateValidatorPath(newProblem.id, `main.${validatorExt}`);
			await copyObject(validatorFrom, validatorTo);
			copiedKeys.push(validatorTo);
		}

		// 5) Migrate inline images + rewrite markdown.
		const imageResult = await migrateWorkshopImages(workshopProblemId, newProblem.id);
		copiedKeys.push(...imageResult.copiedKeys);

		const rewrittenContent = rewriteWorkshopImageUrls(
			state.problem.description,
			workshopProblemId,
			newProblem.id
		);

		// 6) DB writes in a single transaction.
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

			// 6a. Update translations with rewritten markdown + paths.
			await tx
				.update(problems)
				.set({
					translations: finalTranslations,
					checkerPath: checkerTo,
					validatorPath: validatorTo,
					updatedAt: new Date(),
				})
				.where(eq(problems.id, newProblem.id));

			// 6b. Insert testcases rows.
			for (let i = 0; i < state.testcases.length; i++) {
				const tc = state.testcases[i];
				const targetIndex = i + 1;
				await tx.insert(testcases).values({
					problemId: newProblem.id,
					inputPath: generateTestcasePath(newProblem.id, targetIndex, "input"),
					outputPath: generateTestcasePath(newProblem.id, targetIndex, "output"),
					subtaskGroup: tc.subtaskGroup,
					score: tc.score,
					isHidden: true,
				});
			}

			// 6c. Author/reviewer mapping is intentionally NOT auto-populated;
			//     admin assigns manually after publish.

			// 6d. Link publishedProblemId.
			await tx
				.update(workshopProblems)
				.set({ publishedProblemId: newProblem.id, updatedAt: new Date() })
				.where(eq(workshopProblems.id, workshopProblemId));
		});

		return { problemId: newProblem.id, mode: "created" };
	} catch (err) {
		// Rollback: delete copied S3 keys + the initial problems row.
		console.error("[workshop-publish] publish failed, rolling back:", err);
		for (const key of copiedKeys) {
			try {
				await deleteFile(key);
			} catch (delErr) {
				console.error(`[workshop-publish] rollback delete failed for ${key}:`, delErr);
			}
		}
		try {
			await db.delete(problems).where(eq(problems.id, newProblem.id));
		} catch (delErr) {
			console.error("[workshop-publish] rollback problem row delete failed:", delErr);
		}
		throw err;
	}
}

/**
 * Re-publish: keep `problems.id`, wipe existing testcase rows + all associated
 * S3 files, then copy fresh from the latest committed snapshot.
 *
 * Destructive. Caller (admin UI) must show a confirm dialog first.
 */
export async function republishWorkshopToExistingProblem(
	opts: PublishOptions
): Promise<PublishResult> {
	const { workshopProblemId } = opts;

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
		.select()
		.from(problems)
		.where(eq(problems.id, publishedId))
		.limit(1);
	if (!existingProblem) {
		throw new Error(
			`publishedProblemId=${publishedId}가 가리키는 problems row가 없습니다. 새로 출판하세요.`
		);
	}

	await assertReady(workshopProblemId);
	const { state } = await loadLatestSnapshot(workshopProblemId);

	// 1) Snapshot old S3 key prefixes for best-effort cleanup AFTER successful swap.
	const oldProblemPrefix = `${generateProblemBasePath(publishedId)}/`;
	const oldImagePrefix = `images/problems/${publishedId}/`;

	const copiedKeys: string[] = [];

	try {
		// 2) Copy testcases (overwrites existing S3 keys in place — safe).
		for (let i = 0; i < state.testcases.length; i++) {
			const tc = state.testcases[i];
			const targetIndex = i + 1;
			if (!tc.outputHash) {
				throw new Error(`테스트케이스 ${tc.index}에 정답이 없습니다.`);
			}
			const inputTo = generateTestcasePath(publishedId, targetIndex, "input");
			const outputTo = generateTestcasePath(publishedId, targetIndex, "output");
			await copyObject(workshopObjectPath(workshopProblemId, tc.inputHash), inputTo);
			copiedKeys.push(inputTo);
			await copyObject(workshopObjectPath(workshopProblemId, tc.outputHash), outputTo);
			copiedKeys.push(outputTo);
		}

		// 3) Copy checker (required).
		if (!state.problem.checkerHash || !state.problem.checkerLanguage) {
			throw new Error("체커가 설정되어 있지 않습니다.");
		}
		const checkerExt = extensionForLanguage(state.problem.checkerLanguage);
		const checkerTo = generateCheckerPath(publishedId, `main.${checkerExt}`);
		await copyObject(workshopObjectPath(workshopProblemId, state.problem.checkerHash), checkerTo);
		copiedKeys.push(checkerTo);

		// 4) Copy validator (optional).
		let validatorTo: string | null = null;
		if (state.problem.validatorHash && state.problem.validatorLanguage) {
			const validatorExt = extensionForLanguage(state.problem.validatorLanguage);
			validatorTo = generateValidatorPath(publishedId, `main.${validatorExt}`);
			await copyObject(
				workshopObjectPath(workshopProblemId, state.problem.validatorHash),
				validatorTo
			);
			copiedKeys.push(validatorTo);
		}

		// 5) Re-migrate images + rewrite markdown.
		const imageResult = await migrateWorkshopImages(workshopProblemId, publishedId);
		copiedKeys.push(...imageResult.copiedKeys);

		const rewrittenContent = rewriteWorkshopImageUrls(
			state.problem.description,
			workshopProblemId,
			publishedId
		);

		// 6) DB transaction: delete old testcase rows, update problems, insert fresh rows.
		//    S3 files are already overwritten/created above; only DB rows need swapping.
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
					checkerPath: checkerTo,
					validatorPath: validatorTo,
					updatedAt: new Date(),
				})
				.where(eq(problems.id, publishedId));

			for (let i = 0; i < state.testcases.length; i++) {
				const tc = state.testcases[i];
				const targetIndex = i + 1;
				await tx.insert(testcases).values({
					problemId: publishedId,
					inputPath: generateTestcasePath(publishedId, targetIndex, "input"),
					outputPath: generateTestcasePath(publishedId, targetIndex, "output"),
					subtaskGroup: tc.subtaskGroup,
					score: tc.score,
					isHidden: true,
				});
			}

			await tx
				.update(workshopProblems)
				.set({ updatedAt: new Date() })
				.where(eq(workshopProblems.id, workshopProblemId));
		});

		// 7) Best-effort: delete S3 objects that belonged to old testcases but are no
		//    longer referenced. Since new data occupies the same key pattern (testcase_N),
		//    only keys with indices > new testcase count or old checker/validator with
		//    different extensions are orphaned. Use listObjects to find stale keys.
		try {
			const allKeys = await listObjects(oldProblemPrefix);
			const newKeySet = new Set(copiedKeys);
			for (const key of allKeys) {
				if (!newKeySet.has(key)) {
					try {
						await deleteFile(key);
					} catch {}
				}
			}
			const oldImageKeys = await listObjects(oldImagePrefix);
			const newImageKeySet = new Set(imageResult.copiedKeys);
			for (const key of oldImageKeys) {
				if (!newImageKeySet.has(key)) {
					try {
						await deleteFile(key);
					} catch {}
				}
			}
		} catch (cleanupErr) {
			console.warn("[workshop-publish] best-effort orphan cleanup failed:", cleanupErr);
		}

		return { problemId: publishedId, mode: "updated" };
	} catch (err) {
		console.error("[workshop-publish] republish failed:", err);
		// On failure the OLD data is still intact in DB (we didn't delete rows yet
		// if the error happened before the transaction, or the transaction rolled
		// back). S3 objects that were overwritten are lost, but the workshop object
		// store still has the source-of-truth hashes. No further cleanup needed.
		for (const key of copiedKeys) {
			try {
				await deleteFile(key);
			} catch (delErr) {
				console.error(`[workshop-publish] cleanup delete failed for ${key}:`, delErr);
			}
		}
		throw err;
	}
}
