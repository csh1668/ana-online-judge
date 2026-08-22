import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopDraft,
	workshopDrafts,
	workshopResources,
	workshopTestcases,
} from "@/db/schema";
import { SYSTEM_JOB_PRIORITY } from "@/lib/judge-priority";
import { pushWorkshopValidateJob } from "@/lib/judge-queue";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import { draftUpdateConflictError } from "@/lib/workshop/draft-version-conflict";
import { assertDraftNotLocked } from "@/lib/workshop/op-lock";
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
	version: number;
};

export async function getValidatorSource(
	problemId: number,
	userId: number
): Promise<ValidatorState> {
	const [row] = await db
		.select({
			validatorLanguage: workshopDrafts.validatorLanguage,
			validatorPath: workshopDrafts.validatorPath,
			version: workshopDrafts.version,
		})
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!row) throw new Error("드래프트를 찾을 수 없습니다");
	if (!row.validatorPath || !row.validatorLanguage) {
		return { problemId, language: null, path: null, source: null, version: row.version };
	}
	const language = (row.validatorLanguage === "python" ? "python" : "cpp") as ValidatorLanguage;
	const content = await downloadFile(row.validatorPath);
	return {
		problemId,
		language,
		path: row.validatorPath,
		source: content.toString("utf-8"),
		version: row.version,
	};
}

/**
 * 낙관적 버전 가드: `params.expectedVersion`이 현재 버전과 다르면 충돌 에러.
 */
export async function saveValidatorSource(params: {
	problemId: number;
	userId: number;
	language: ValidatorLanguage;
	source: string;
	expectedVersion: number;
}): Promise<WorkshopDraft> {
	const { problemId, userId, language, source, expectedVersion } = params;
	const bytes = Buffer.byteLength(source, "utf-8");
	if (bytes === 0) {
		throw new Error("밸리데이터 소스가 비어 있습니다");
	}
	if (bytes > MAX_VALIDATOR_BYTES) {
		throw new Error("밸리데이터 소스는 최대 1MB까지 저장할 수 있습니다");
	}

	const [existing] = await db
		.select({
			id: workshopDrafts.id,
			validatorLanguage: workshopDrafts.validatorLanguage,
			validatorPath: workshopDrafts.validatorPath,
			version: workshopDrafts.version,
		})
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!existing) throw new Error("드래프트를 찾을 수 없습니다");
	await assertDraftNotLocked(existing.id);
	// Pre-check BEFORE the MinIO write: the validator's storage key is
	// deterministic (not content-addressed), so an upload from a losing
	// writer would otherwise silently clobber the winner's object even
	// though the guarded UPDATE below correctly rejects the DB write. This
	// shrinks the DB/object divergence window from "whole user think-time"
	// to the gap between this check and the guarded UPDATE — fully closing
	// it would need versioned validator keys, which is out of scope here.
	if (existing.version !== expectedVersion) throw await draftUpdateConflictError(problemId, userId);

	const newPath = workshopDraftValidatorPath(problemId, userId, extForLanguage(language));
	await uploadFile(newPath, Buffer.from(source, "utf-8"), contentTypeForLanguage(language));

	const [updated] = await db
		.update(workshopDrafts)
		.set({
			validatorPath: newPath,
			validatorLanguage: language,
			version: sql`${workshopDrafts.version} + 1`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(workshopDrafts.workshopProblemId, problemId),
				eq(workshopDrafts.userId, userId),
				eq(workshopDrafts.version, expectedVersion)
			)
		)
		.returning();

	if (!updated) throw await draftUpdateConflictError(problemId, userId);

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

/**
 * 낙관적 버전 가드: `expectedVersion`이 현재 버전과 다르면 충돌 에러.
 */
export async function deleteValidator(
	problemId: number,
	userId: number,
	expectedVersion: number
): Promise<WorkshopDraft> {
	const [existing] = await db
		.select({
			id: workshopDrafts.id,
			validatorPath: workshopDrafts.validatorPath,
		})
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!existing) throw new Error("드래프트를 찾을 수 없습니다");
	await assertDraftNotLocked(existing.id);
	const [updated] = await db
		.update(workshopDrafts)
		.set({
			validatorPath: null,
			validatorLanguage: null,
			version: sql`${workshopDrafts.version} + 1`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(workshopDrafts.workshopProblemId, problemId),
				eq(workshopDrafts.userId, userId),
				eq(workshopDrafts.version, expectedVersion)
			)
		)
		.returning();
	if (!updated) throw await draftUpdateConflictError(problemId, userId);

	// Best-effort: delete the object AFTER the guarded DB update succeeds —
	// deleting before the guard risks removing a concurrent winner's file
	// out from under it (see saveValidatorSource's pre-check comment for the
	// same class of race). Delete failures are swallowed either way, so
	// this reordering has no other behavioral cost.
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

	const [draft] = await db
		.select({
			validatorLanguage: workshopDrafts.validatorLanguage,
			validatorPath: workshopDrafts.validatorPath,
			timeLimit: workshopDrafts.timeLimit,
			memoryLimit: workshopDrafts.memoryLimit,
		})
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!draft) throw new Error("드래프트를 찾을 수 없습니다");
	if (!draft.validatorPath || !draft.validatorLanguage) {
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
		await pushWorkshopValidateJob(
			{
				jobId,
				problemId,
				userId,
				testcaseId: tc.id,
				language: draft.validatorLanguage,
				validatorSourcePath: draft.validatorPath,
				inputPath: tc.inputPath,
				resources: resources.map((r) => ({ name: r.name, storage_path: r.path })),
				timeLimitMs: 30_000,
				memoryLimitMb: draft.memoryLimit * 2 + 256,
			},
			SYSTEM_JOB_PRIORITY
		);
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
