import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { type Language, type WorkshopSolution, workshopSolutions } from "@/db/schema";
import { getFileExtension } from "@/lib/languages";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import type { WorkshopExpectedVerdict } from "@/lib/workshop/expected-verdict";
import { assertDraftNotLocked } from "@/lib/workshop/op-lock";
import { workshopDraftSolutionPath } from "@/lib/workshop/paths";

const MAX_SOLUTION_BYTES = 2 * 1024 * 1024; // 2MB source file cap
const MAX_SOLUTIONS_PER_DRAFT = 30;
const NAME_PATTERN = /^[\w\-.]{1,64}$/;

function assertValidName(name: string): void {
	if (!NAME_PATTERN.test(name)) {
		throw new Error("솔루션 이름은 영문/숫자/언더바/하이픈/점만 허용되며 1–64자여야 합니다");
	}
	// Solution source files are written into the sandbox as the language's
	// canonical filename (Main.cpp / Main.py / etc.), not by user-given name —
	// so there's no collision with sandbox slot names. "main" is in fact the
	// conventional name for the primary solution.
}

export async function listSolutionsForDraft(draftId: number): Promise<WorkshopSolution[]> {
	return db
		.select()
		.from(workshopSolutions)
		.where(eq(workshopSolutions.draftId, draftId))
		.orderBy(asc(workshopSolutions.createdAt));
}

export async function getSolution(
	solutionId: number,
	draftId: number
): Promise<WorkshopSolution | null> {
	const [row] = await db
		.select()
		.from(workshopSolutions)
		.where(and(eq(workshopSolutions.id, solutionId), eq(workshopSolutions.draftId, draftId)))
		.limit(1);
	return row ?? null;
}

export async function readSolutionSource(
	solutionId: number,
	draftId: number
): Promise<{ name: string; language: Language; text: string }> {
	const s = await getSolution(solutionId, draftId);
	if (!s) throw new Error("솔루션을 찾을 수 없습니다");
	const buf = await downloadFile(s.sourcePath);
	return { name: s.name, language: s.language, text: buf.toString("utf-8") };
}

export type CreateSolutionInput = {
	problemId: number;
	userId: number;
	draftId: number;
	name: string;
	language: Language;
	source: string;
	expectedVerdict: WorkshopExpectedVerdict;
	isMain: boolean;
};

/**
 * Create a solution. If `isMain=true`, the caller must already have run
 * `setMainSolution` OR we atomically flip inside a transaction here.
 * We keep the atomic flip in this call so server-action code can't leave
 * a split-brain state.
 */
export async function createSolution(input: CreateSolutionInput): Promise<WorkshopSolution> {
	await assertDraftNotLocked(input.draftId);
	assertValidName(input.name);
	const bytes = Buffer.byteLength(input.source, "utf-8");
	if (bytes > MAX_SOLUTION_BYTES) {
		throw new Error("솔루션 소스는 최대 2MB까지 업로드 가능합니다");
	}
	const ext = getFileExtension(input.language);
	const sourcePath = workshopDraftSolutionPath(input.problemId, input.userId, input.name, ext);

	// Pre-check name uniqueness before uploading — the MinIO key is derived
	// from the name, so uploading first would silently overwrite an existing
	// solution's source file if the names collide, before the in-tx dup
	// check even runs.
	const [preDup] = await db
		.select({ id: workshopSolutions.id })
		.from(workshopSolutions)
		.where(
			and(eq(workshopSolutions.draftId, input.draftId), eq(workshopSolutions.name, input.name))
		)
		.limit(1);
	if (preDup) throw new Error("같은 이름의 솔루션이 이미 존재합니다");

	// Upload before the transaction so the tx isn't held open across MinIO
	// I/O. If the tx below fails, best-effort delete the now-orphaned upload.
	await uploadFile(sourcePath, Buffer.from(input.source, "utf-8"), "text/plain");

	try {
		return await db.transaction(async (tx) => {
			// Name uniqueness check inside transaction — final defense against a
			// race with the pre-check above (unique index also guards this).
			const [dup] = await tx
				.select({ id: workshopSolutions.id })
				.from(workshopSolutions)
				.where(
					and(eq(workshopSolutions.draftId, input.draftId), eq(workshopSolutions.name, input.name))
				)
				.limit(1);
			if (dup) throw new Error("같은 이름의 솔루션이 이미 존재합니다");

			const [{ value: existingCount }] = await tx
				.select({ value: count() })
				.from(workshopSolutions)
				.where(eq(workshopSolutions.draftId, input.draftId));
			if (existingCount >= MAX_SOLUTIONS_PER_DRAFT) {
				throw new Error(
					`솔루션은 draft당 최대 ${MAX_SOLUTIONS_PER_DRAFT}개까지 등록할 수 있습니다`
				);
			}

			if (input.isMain) {
				await tx
					.update(workshopSolutions)
					.set({ isMain: false, updatedAt: new Date() })
					.where(eq(workshopSolutions.draftId, input.draftId));
			}

			const [created] = await tx
				.insert(workshopSolutions)
				.values({
					draftId: input.draftId,
					name: input.name,
					language: input.language,
					sourcePath,
					expectedVerdict: input.expectedVerdict,
					isMain: input.isMain,
				})
				.returning();
			return created;
		});
	} catch (err) {
		// Best-effort cleanup — but never delete a file a committed row now
		// owns. Two concurrent creates for the same (draftId, name) upload to
		// the same sourcePath; if the other one won the race and committed,
		// our tx fails BECAUSE of that commit, so its row is already visible
		// here — deleting sourcePath in that case would destroy the live file.
		const [owner] = await db
			.select({ id: workshopSolutions.id })
			.from(workshopSolutions)
			.where(
				and(
					eq(workshopSolutions.draftId, input.draftId),
					eq(workshopSolutions.sourcePath, sourcePath)
				)
			)
			.limit(1);
		if (!owner) {
			try {
				await deleteFile(sourcePath);
			} catch {
				// best-effort cleanup — nothing else to do if this fails
			}
		}
		throw err;
	}
}

export type UpdateSolutionInput = {
	problemId: number;
	userId: number;
	draftId: number;
	solutionId: number;
	// Metadata — all optional, only included fields are changed
	name?: string;
	language?: Language;
	source?: string;
	expectedVerdict?: WorkshopExpectedVerdict;
};

/**
 * Update solution metadata and/or source. Rename triggers an S3 copy-delete
 * because the MinIO key is derived from name + extension. `setMainSolution`
 * is a separate function to keep this one simple.
 */
export async function updateSolution(input: UpdateSolutionInput): Promise<WorkshopSolution> {
	await assertDraftNotLocked(input.draftId);
	const existing = await getSolution(input.solutionId, input.draftId);
	if (!existing) throw new Error("솔루션을 찾을 수 없습니다");

	if (input.source !== undefined) {
		const bytes = Buffer.byteLength(input.source, "utf-8");
		if (bytes > MAX_SOLUTION_BYTES) {
			throw new Error("솔루션 소스는 최대 2MB까지 업로드 가능합니다");
		}
	}
	if (input.name !== undefined && input.name !== existing.name) {
		assertValidName(input.name);
	}

	const nextName = input.name ?? existing.name;
	const nextLanguage = input.language ?? existing.language;
	const nextExpected = input.expectedVerdict ?? existing.expectedVerdict;
	const ext = getFileExtension(nextLanguage);
	const nextPath = workshopDraftSolutionPath(input.problemId, input.userId, nextName, ext);
	const renamedOrRetyped = nextPath !== existing.sourcePath;

	// Upload before the transaction. When renamed/retyped this only ever
	// writes to a *new* key (existing.sourcePath is untouched), so it's safe
	// to do outside the tx. When not renamed, this overwrites the same key
	// in place either way — order doesn't matter there.
	//
	// Determine the content to upload:
	// - if source provided → new text
	// - else if renamed/retyped → re-upload existing content at new key
	// - else → no upload needed
	if (input.source !== undefined) {
		await uploadFile(nextPath, Buffer.from(input.source, "utf-8"), "text/plain");
	} else if (renamedOrRetyped) {
		const old = await downloadFile(existing.sourcePath);
		await uploadFile(nextPath, old, "text/plain");
	}

	try {
		const updated = await db.transaction(async (tx) => {
			// Uniqueness on rename
			if (input.name !== undefined && input.name !== existing.name) {
				const [dup] = await tx
					.select({ id: workshopSolutions.id })
					.from(workshopSolutions)
					.where(
						and(
							eq(workshopSolutions.draftId, input.draftId),
							eq(workshopSolutions.name, input.name)
						)
					)
					.limit(1);
				if (dup) throw new Error("같은 이름의 솔루션이 이미 존재합니다");
			}

			const [row] = await tx
				.update(workshopSolutions)
				.set({
					name: nextName,
					language: nextLanguage,
					sourcePath: nextPath,
					expectedVerdict: nextExpected,
					updatedAt: new Date(),
				})
				.where(eq(workshopSolutions.id, input.solutionId))
				.returning();
			return row;
		});

		// Commit succeeded — the row now points at nextPath, so the old key
		// (if different) is safe to reclaim. Best-effort: a leftover old file
		// is an orphan, not data loss.
		if (renamedOrRetyped) {
			try {
				await deleteFile(existing.sourcePath);
			} catch {
				// best-effort cleanup — nothing else to do if this fails
			}
		}
		return updated;
	} catch (err) {
		// tx failed — the row still points at existing.sourcePath (untouched).
		// The upload above only ever wrote to nextPath, so best-effort clean
		// that up if it was a new key to avoid leaving an orphan.
		//
		// But never delete a file a committed row now owns: a concurrent
		// rename/create targeting the same nextPath may have won the race and
		// committed. Our tx fails BECAUSE that commit made our name/path
		// choice stale, so at this point the winner's row is already visible
		// to this query.
		if (renamedOrRetyped) {
			const [owner] = await db
				.select({ id: workshopSolutions.id })
				.from(workshopSolutions)
				.where(
					and(
						eq(workshopSolutions.draftId, input.draftId),
						eq(workshopSolutions.sourcePath, nextPath)
					)
				)
				.limit(1);
			if (!owner) {
				try {
					await deleteFile(nextPath);
				} catch {
					// best-effort cleanup — nothing else to do if this fails
				}
			}
		}
		throw err;
	}
}

/**
 * Atomically flip isMain: unset on all others in the draft, set on target.
 * Idempotent — calling when `target` already has isMain=true is a no-op
 * (still touches updatedAt for auditability).
 */
export async function setMainSolution(draftId: number, solutionId: number): Promise<void> {
	await db.transaction(async (tx) => {
		const [target] = await tx
			.select({ id: workshopSolutions.id })
			.from(workshopSolutions)
			.where(and(eq(workshopSolutions.id, solutionId), eq(workshopSolutions.draftId, draftId)))
			.limit(1);
		if (!target) throw new Error("솔루션을 찾을 수 없습니다");

		await tx
			.update(workshopSolutions)
			.set({ isMain: false, updatedAt: new Date() })
			.where(eq(workshopSolutions.draftId, draftId));

		await tx
			.update(workshopSolutions)
			.set({ isMain: true, updatedAt: new Date() })
			.where(eq(workshopSolutions.id, solutionId));
	});
}

/**
 * Unset main on all solutions in the draft (no solution is main).
 */
export async function unsetMainSolution(draftId: number): Promise<void> {
	await db
		.update(workshopSolutions)
		.set({ isMain: false, updatedAt: new Date() })
		.where(eq(workshopSolutions.draftId, draftId));
}

export async function deleteSolution(draftId: number, solutionId: number): Promise<void> {
	await assertDraftNotLocked(draftId);
	const s = await getSolution(solutionId, draftId);
	if (!s) throw new Error("솔루션을 찾을 수 없습니다");
	await deleteFile(s.sourcePath);
	await db.delete(workshopSolutions).where(eq(workshopSolutions.id, solutionId));
}

/**
 * Convenience: find the main solution for a draft, or null if none.
 */
export async function getMainSolution(draftId: number): Promise<WorkshopSolution | null> {
	const [row] = await db
		.select()
		.from(workshopSolutions)
		.where(and(eq(workshopSolutions.draftId, draftId), eq(workshopSolutions.isMain, true)))
		.limit(1);
	return row ?? null;
}
