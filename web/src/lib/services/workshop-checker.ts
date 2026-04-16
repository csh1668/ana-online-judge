import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopProblem, workshopProblems } from "@/db/schema";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import { readBundledCheckerSource, type WorkshopCheckerPreset } from "@/lib/workshop/bundled";
import { workshopDraftCheckerPath } from "@/lib/workshop/paths";

const MAX_CHECKER_BYTES = 1 * 1024 * 1024; // 1MB — testlib checkers are always tiny

export type CheckerLanguage = "cpp" | "python";

function extForLanguage(language: CheckerLanguage): "cpp" | "py" {
	return language === "cpp" ? "cpp" : "py";
}

function contentTypeForLanguage(language: CheckerLanguage): string {
	return language === "cpp" ? "text/x-c++src" : "text/x-python";
}

export type CheckerState = {
	problemId: number;
	language: CheckerLanguage;
	path: string;
	source: string;
};

/**
 * Read the current checker source for a problem.
 * Requires `workshopProblems.checkerPath` to be set (auto-seeded during
 * `ensureWorkshopDraft`). Throws otherwise.
 */
export async function getCheckerSource(problemId: number): Promise<CheckerState> {
	const [row] = await db
		.select({
			id: workshopProblems.id,
			checkerLanguage: workshopProblems.checkerLanguage,
			checkerPath: workshopProblems.checkerPath,
		})
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!row) throw new Error("문제를 찾을 수 없습니다");
	if (!row.checkerPath || !row.checkerLanguage) {
		throw new Error("체커가 아직 초기화되지 않았습니다");
	}
	const language = (row.checkerLanguage === "python" ? "python" : "cpp") as CheckerLanguage;
	const content = await downloadFile(row.checkerPath);
	return {
		problemId: row.id,
		language,
		path: row.checkerPath,
		source: content.toString("utf-8"),
	};
}

/**
 * Overwrite the checker source. If the incoming `language` differs from the
 * stored one, the previous MinIO object is deleted and a new one is written
 * at the new path (`checker.{ext}` in the user's draft namespace).
 */
export async function saveCheckerSource(params: {
	problemId: number;
	userId: number;
	language: CheckerLanguage;
	source: string;
}): Promise<WorkshopProblem> {
	const { problemId, userId, language, source } = params;
	const bytes = Buffer.byteLength(source, "utf-8");
	if (bytes === 0) {
		throw new Error("체커 소스가 비어 있습니다");
	}
	if (bytes > MAX_CHECKER_BYTES) {
		throw new Error("체커 소스는 최대 1MB까지 저장할 수 있습니다");
	}

	const [existing] = await db
		.select({
			checkerLanguage: workshopProblems.checkerLanguage,
			checkerPath: workshopProblems.checkerPath,
		})
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!existing) throw new Error("문제를 찾을 수 없습니다");

	const newPath = workshopDraftCheckerPath(problemId, userId, extForLanguage(language));
	await uploadFile(newPath, Buffer.from(source, "utf-8"), contentTypeForLanguage(language));

	const [updated] = await db
		.update(workshopProblems)
		.set({
			checkerPath: newPath,
			checkerLanguage: language,
			updatedAt: new Date(),
		})
		.where(eq(workshopProblems.id, problemId))
		.returning();

	// Best-effort: delete old object AFTER DB update succeeds.
	if (existing.checkerPath && existing.checkerPath !== newPath) {
		try {
			await deleteFile(existing.checkerPath);
		} catch (err) {
			console.warn(
				`[workshop-checker] failed to delete previous checker ${existing.checkerPath}:`,
				err
			);
		}
	}

	return updated;
}

/**
 * Overwrite the current checker slot with a bundled preset source.
 * Always sets language to `cpp` (all bundled presets are C++).
 */
export async function resetCheckerToPreset(params: {
	problemId: number;
	userId: number;
	preset: WorkshopCheckerPreset;
}): Promise<CheckerState> {
	const content = await readBundledCheckerSource(params.preset);
	await saveCheckerSource({
		problemId: params.problemId,
		userId: params.userId,
		language: "cpp",
		source: content.toString("utf-8"),
	});
	return getCheckerSource(params.problemId);
}
