import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopProblem,
	workshopProblems,
	workshopResources,
	workshopTestcases,
} from "@/db/schema";
import { pushWorkshopValidateJob } from "@/lib/judge-queue";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import { workshopDraftValidatorPath } from "@/lib/workshop/paths";

const MAX_VALIDATOR_BYTES = 1 * 1024 * 1024; // 1MB

export type ValidatorLanguage = "cpp" | "python";

function extForLanguage(language: ValidatorLanguage): "cpp" | "py" {
	return language === "cpp" ? "cpp" : "py";
}

function contentTypeForLanguage(language: ValidatorLanguage): string {
	return language === "cpp" ? "text/x-c++src" : "text/x-python";
}

export type ValidatorState = {
	problemId: number;
	language: ValidatorLanguage | null;
	path: string | null;
	source: string | null;
};

export async function getValidatorSource(problemId: number): Promise<ValidatorState> {
	const [row] = await db
		.select({
			id: workshopProblems.id,
			validatorLanguage: workshopProblems.validatorLanguage,
			validatorPath: workshopProblems.validatorPath,
		})
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!row) throw new Error("문제를 찾을 수 없습니다");
	if (!row.validatorPath || !row.validatorLanguage) {
		return { problemId: row.id, language: null, path: null, source: null };
	}
	const language = (row.validatorLanguage === "python" ? "python" : "cpp") as ValidatorLanguage;
	const content = await downloadFile(row.validatorPath);
	return {
		problemId: row.id,
		language,
		path: row.validatorPath,
		source: content.toString("utf-8"),
	};
}

export async function saveValidatorSource(params: {
	problemId: number;
	userId: number;
	language: ValidatorLanguage;
	source: string;
}): Promise<WorkshopProblem> {
	const { problemId, userId, language, source } = params;
	const bytes = Buffer.byteLength(source, "utf-8");
	if (bytes === 0) {
		throw new Error("밸리데이터 소스가 비어 있습니다");
	}
	if (bytes > MAX_VALIDATOR_BYTES) {
		throw new Error("밸리데이터 소스는 최대 1MB까지 저장할 수 있습니다");
	}

	const [existing] = await db
		.select({
			validatorLanguage: workshopProblems.validatorLanguage,
			validatorPath: workshopProblems.validatorPath,
		})
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!existing) throw new Error("문제를 찾을 수 없습니다");

	const newPath = workshopDraftValidatorPath(problemId, userId, extForLanguage(language));
	await uploadFile(newPath, Buffer.from(source, "utf-8"), contentTypeForLanguage(language));

	const [updated] = await db
		.update(workshopProblems)
		.set({
			validatorPath: newPath,
			validatorLanguage: language,
			updatedAt: new Date(),
		})
		.where(eq(workshopProblems.id, problemId))
		.returning();

	// Best-effort: delete old object AFTER DB update succeeds.
	if (existing.validatorPath && existing.validatorPath !== newPath) {
		try {
			await deleteFile(existing.validatorPath);
		} catch (err) {
			console.warn(
				`[workshop-validator] failed to delete previous validator ${existing.validatorPath}:`,
				err
			);
		}
	}

	return updated;
}

export async function deleteValidator(problemId: number): Promise<WorkshopProblem> {
	const [existing] = await db
		.select({
			validatorPath: workshopProblems.validatorPath,
		})
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!existing) throw new Error("문제를 찾을 수 없습니다");
	if (existing.validatorPath) {
		try {
			await deleteFile(existing.validatorPath);
		} catch (err) {
			console.warn(
				`[workshop-validator] failed to delete validator ${existing.validatorPath}:`,
				err
			);
		}
	}
	const [updated] = await db
		.update(workshopProblems)
		.set({ validatorPath: null, validatorLanguage: null, updatedAt: new Date() })
		.where(eq(workshopProblems.id, problemId))
		.returning();
	return updated;
}

export type QueuedValidationJob = {
	jobId: string;
	testcaseId: number;
	testcaseIndex: number;
};

/**
 * Queue a full-validation run: one `workshop_validate` job per testcase in the draft.
 * - Resets every testcase's `validationStatus` to `pending` up-front.
 * - Returns the list of enqueued (jobId, testcaseId, testcaseIndex) triples.
 * The caller is responsible for wiring a subscriber that converts completion
 * events into DB updates (see `web/src/lib/workshop/validate-pubsub.ts`).
 *
 * Throws if:
 * - the validator slot is empty (`validatorPath IS NULL`)
 * - the draft has no testcases
 */
export async function runFullValidation(params: {
	problemId: number;
	userId: number;
	draftId: number;
}): Promise<QueuedValidationJob[]> {
	const { problemId, userId, draftId } = params;

	const [problem] = await db
		.select({
			validatorLanguage: workshopProblems.validatorLanguage,
			validatorPath: workshopProblems.validatorPath,
			timeLimit: workshopProblems.timeLimit,
			memoryLimit: workshopProblems.memoryLimit,
		})
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!problem) throw new Error("문제를 찾을 수 없습니다");
	if (!problem.validatorPath || !problem.validatorLanguage) {
		throw new Error("밸리데이터가 설정되지 않았습니다");
	}

	const testcases = await db
		.select({
			id: workshopTestcases.id,
			index: workshopTestcases.index,
			inputPath: workshopTestcases.inputPath,
		})
		.from(workshopTestcases)
		.where(eq(workshopTestcases.draftId, draftId))
		.orderBy(asc(workshopTestcases.index));
	if (testcases.length === 0) {
		throw new Error("검증할 테스트케이스가 없습니다");
	}

	const resources = await db
		.select({ name: workshopResources.name, path: workshopResources.path })
		.from(workshopResources)
		.where(eq(workshopResources.draftId, draftId));

	await db
		.update(workshopTestcases)
		.set({ validationStatus: "pending" })
		.where(eq(workshopTestcases.draftId, draftId));

	const queued: QueuedValidationJob[] = [];
	for (const tc of testcases) {
		const jobId = randomUUID();
		await pushWorkshopValidateJob({
			jobId,
			problemId,
			userId,
			testcaseId: tc.id,
			language: problem.validatorLanguage,
			validatorSourcePath: problem.validatorPath,
			inputPath: tc.inputPath,
			resources: resources.map((r) => ({ name: r.name, storage_path: r.path })),
			timeLimitMs: 30_000,
			memoryLimitMb: problem.memoryLimit * 2 + 256,
		});
		queued.push({ jobId, testcaseId: tc.id, testcaseIndex: tc.index });
	}

	return queued;
}

/**
 * Apply a single `workshop_validate` result row (fetched from Redis) to the
 * corresponding `workshopTestcases.validationStatus`. Used by the SSE
 * subscriber (`web/src/lib/workshop/validate-pubsub.ts`). Checking draft
 * scoping is handled by the subscriber — this function trusts its caller.
 */
export async function applyValidationResult(params: {
	testcaseId: number;
	draftId: number;
	valid: boolean;
}): Promise<void> {
	await db
		.update(workshopTestcases)
		.set({ validationStatus: params.valid ? "valid" : "invalid" })
		.where(
			and(
				eq(workshopTestcases.id, params.testcaseId),
				eq(workshopTestcases.draftId, params.draftId)
			)
		);
}
