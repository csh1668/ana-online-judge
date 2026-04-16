import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	problemAuthors,
	problems,
	testcases,
	workshopProblemMembers,
	workshopProblems,
	workshopSnapshots,
} from "@/db/schema";
import {
	migrateWorkshopImages,
	rewriteWorkshopImageUrls,
} from "@/lib/services/workshop-publish-images";
import { computePublishReadiness } from "@/lib/services/workshop-publish-readiness";
import {
	copyObject,
	deleteAllProblemFiles,
	deleteAllWithPrefix,
	deleteFile,
} from "@/lib/storage/operations";
import {
	generateCheckerPath,
	generateTestcasePath,
	generateValidatorPath,
} from "@/lib/storage/paths";
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
	const [newProblem] = await db
		.insert(problems)
		.values({
			title: state.problem.title,
			content: state.problem.description,
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
			// 6a. Update problems.content with rewritten markdown + paths.
			await tx
				.update(problems)
				.set({
					content: rewrittenContent,
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

			// 6c. Map owner members to problemAuthors.
			const ownerRows = await tx
				.select({
					userId: workshopProblemMembers.userId,
					role: workshopProblemMembers.role,
				})
				.from(workshopProblemMembers)
				.where(eq(workshopProblemMembers.workshopProblemId, workshopProblemId));
			for (const row of ownerRows) {
				if (row.role !== "owner") continue;
				await tx
					.insert(problemAuthors)
					.values({ problemId: newProblem.id, userId: row.userId })
					.onConflictDoNothing();
			}

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

	// 1) Wipe existing testcase rows + all S3 files.
	await db.delete(testcases).where(eq(testcases.problemId, publishedId));
	await deleteAllProblemFiles(publishedId);
	await deleteAllWithPrefix(`images/problems/${publishedId}/`);

	const copiedKeys: string[] = [];

	try {
		// 2) Copy testcases.
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

		// 6) DB transaction: update problems row + insert fresh testcase rows.
		await db.transaction(async (tx) => {
			await tx
				.update(problems)
				.set({
					title: state.problem.title,
					content: rewrittenContent,
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

		return { problemId: publishedId, mode: "updated" };
	} catch (err) {
		console.error("[workshop-publish] republish failed:", err);
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
