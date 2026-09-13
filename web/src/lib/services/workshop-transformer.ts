import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopDraft, workshopDrafts } from "@/db/schema";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import { draftUpdateConflictError } from "@/lib/workshop/draft-version-conflict";
import { assertDraftNotLocked } from "@/lib/workshop/op-lock";
import { workshopDraftTransformerPath } from "@/lib/workshop/paths";

const MAX_TRANSFORMER_BYTES = 1 * 1024 * 1024; // 1MB — transformers are small relay programs

export type TransformerLanguage = "cpp" | "python";

function extForLanguage(language: TransformerLanguage): "cpp" | "py" {
	return language === "cpp" ? "cpp" : "py";
}

function contentTypeForLanguage(language: TransformerLanguage): string {
	return language === "cpp" ? "text/x-c++src" : "text/x-python";
}

export type TransformerState = {
	problemId: number;
	language: TransformerLanguage;
	path: string;
	source: string;
	version: number;
};

/**
 * Read the current transformer source for a user's draft.
 * Requires `workshopDrafts.transformerPath` to be set. Unlike the checker,
 * two_step drafts have no bundled default transformer (the relay logic is
 * always problem-specific), so this throws whenever it hasn't been saved yet.
 */
export async function getTransformerSource(
	problemId: number,
	userId: number
): Promise<TransformerState> {
	const [row] = await db
		.select({
			transformerLanguage: workshopDrafts.transformerLanguage,
			transformerPath: workshopDrafts.transformerPath,
			version: workshopDrafts.version,
		})
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!row) throw new Error("드래프트를 찾을 수 없습니다");
	if (!row.transformerPath || !row.transformerLanguage) {
		throw new Error("변환기가 아직 초기화되지 않았습니다");
	}
	const language = (row.transformerLanguage === "python" ? "python" : "cpp") as TransformerLanguage;
	const content = await downloadFile(row.transformerPath);
	return {
		problemId,
		language,
		path: row.transformerPath,
		source: content.toString("utf-8"),
		version: row.version,
	};
}

/**
 * Overwrite the transformer source. If the incoming `language` differs from the
 * stored one, the previous MinIO object is deleted and a new one is written
 * at the new path (`transformer.{ext}` in the user's draft namespace).
 * 낙관적 버전 가드: `params.expectedVersion`이 현재 버전과 다르면 충돌 에러.
 */
export async function saveTransformerSource(params: {
	problemId: number;
	userId: number;
	language: TransformerLanguage;
	source: string;
	expectedVersion: number;
}): Promise<WorkshopDraft> {
	const { problemId, userId, language, source, expectedVersion } = params;
	const bytes = Buffer.byteLength(source, "utf-8");
	if (bytes === 0) {
		throw new Error("변환기 소스가 비어 있습니다");
	}
	if (bytes > MAX_TRANSFORMER_BYTES) {
		throw new Error("변환기 소스는 최대 1MB까지 저장할 수 있습니다");
	}

	const [existing] = await db
		.select({
			id: workshopDrafts.id,
			transformerLanguage: workshopDrafts.transformerLanguage,
			transformerPath: workshopDrafts.transformerPath,
			version: workshopDrafts.version,
		})
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	if (!existing) throw new Error("드래프트를 찾을 수 없습니다");
	await assertDraftNotLocked(existing.id);
	// Pre-check BEFORE the MinIO write: the transformer's storage key is
	// deterministic (not content-addressed), so an upload from a losing
	// writer would otherwise silently clobber the winner's object even
	// though the guarded UPDATE below correctly rejects the DB write. This
	// shrinks the DB/object divergence window from "whole user think-time"
	// to the gap between this check and the guarded UPDATE — fully closing
	// it would need versioned transformer keys, which is out of scope here.
	if (existing.version !== expectedVersion) throw await draftUpdateConflictError(problemId, userId);

	const newPath = workshopDraftTransformerPath(problemId, userId, extForLanguage(language));
	await uploadFile(newPath, Buffer.from(source, "utf-8"), contentTypeForLanguage(language));

	const [updated] = await db
		.update(workshopDrafts)
		.set({
			transformerPath: newPath,
			transformerLanguage: language,
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
	if (existing.transformerPath && existing.transformerPath !== newPath) {
		try {
			await deleteFile(existing.transformerPath);
		} catch (err) {
			console.warn(
				`[workshop-transformer] failed to delete previous transformer ${existing.transformerPath}:`,
				err
			);
		}
	}

	return updated;
}
