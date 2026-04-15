import { and, asc, desc, eq, max } from "drizzle-orm";
import JSZip from "jszip";
import { db } from "@/db";
import { type WorkshopTestcase, workshopTestcases } from "@/db/schema";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import { workshopDraftTestcasePath } from "@/lib/workshop/paths";

const MAX_TESTCASE_BYTES = 50 * 1024 * 1024; // 50MB per file

export async function listTestcasesForDraft(draftId: number): Promise<WorkshopTestcase[]> {
	return db
		.select()
		.from(workshopTestcases)
		.where(eq(workshopTestcases.draftId, draftId))
		.orderBy(asc(workshopTestcases.index));
}

export async function getTestcase(
	testcaseId: number,
	draftId: number
): Promise<WorkshopTestcase | null> {
	const [row] = await db
		.select()
		.from(workshopTestcases)
		.where(and(eq(workshopTestcases.id, testcaseId), eq(workshopTestcases.draftId, draftId)))
		.limit(1);
	return row ?? null;
}

/**
 * Compute the next index for a manual testcase: max(existing index) + 1, or 1 if empty.
 * Gaps from deletions are NOT filled — the next add always appends at the end.
 */
export async function nextManualIndex(draftId: number): Promise<number> {
	const [row] = await db
		.select({ maxIndex: max(workshopTestcases.index) })
		.from(workshopTestcases)
		.where(eq(workshopTestcases.draftId, draftId));
	return (row?.maxIndex ?? 0) + 1;
}

export type CreateManualTestcaseInput = {
	problemId: number;
	userId: number;
	draftId: number;
	input: Buffer;
	output: Buffer | null;
	subtaskGroup?: number;
	score?: number;
};

export async function createManualTestcase(
	input: CreateManualTestcaseInput
): Promise<WorkshopTestcase> {
	if (input.input.byteLength > MAX_TESTCASE_BYTES) {
		throw new Error("입력 파일은 최대 50MB까지 업로드 가능합니다");
	}
	if (input.output && input.output.byteLength > MAX_TESTCASE_BYTES) {
		throw new Error("출력 파일은 최대 50MB까지 업로드 가능합니다");
	}
	const index = await nextManualIndex(input.draftId);
	const inputPath = workshopDraftTestcasePath(input.problemId, input.userId, index, "input");
	await uploadFile(inputPath, input.input, "text/plain");
	let outputPath: string | null = null;
	if (input.output) {
		outputPath = workshopDraftTestcasePath(input.problemId, input.userId, index, "output");
		await uploadFile(outputPath, input.output, "text/plain");
	}
	const [created] = await db
		.insert(workshopTestcases)
		.values({
			draftId: input.draftId,
			index,
			source: "manual",
			inputPath,
			outputPath,
			subtaskGroup: input.subtaskGroup ?? 0,
			score: input.score ?? 0,
			validationStatus: "pending",
		})
		.returning();
	return created;
}

export type UpdateTestcaseInput = {
	problemId: number;
	userId: number;
	draftId: number;
	testcaseId: number;
	subtaskGroup?: number;
	score?: number;
	/** If provided, overwrites the input file at the existing MinIO path. */
	newInput?: Buffer;
	/**
	 * If provided with a Buffer, writes/overwrites the output file.
	 * If provided with `null`, clears the output (deletes the file + nulls the column).
	 * If undefined, leaves output untouched.
	 */
	newOutput?: Buffer | null;
};

export async function updateTestcase(params: UpdateTestcaseInput): Promise<WorkshopTestcase> {
	const existing = await getTestcase(params.testcaseId, params.draftId);
	if (!existing) throw new Error("테스트케이스를 찾을 수 없습니다");
	if (existing.source !== "manual") {
		throw new Error("수동 테스트케이스만 편집 가능합니다");
	}
	if (params.newInput && params.newInput.byteLength > MAX_TESTCASE_BYTES) {
		throw new Error("입력 파일은 최대 50MB까지 업로드 가능합니다");
	}
	if (params.newOutput && params.newOutput.byteLength > MAX_TESTCASE_BYTES) {
		throw new Error("출력 파일은 최대 50MB까지 업로드 가능합니다");
	}

	if (params.newInput) {
		await uploadFile(existing.inputPath, params.newInput, "text/plain");
	}

	let outputPath: string | null = existing.outputPath;
	if (params.newOutput === null) {
		if (existing.outputPath) {
			await deleteFile(existing.outputPath);
		}
		outputPath = null;
	} else if (params.newOutput instanceof Buffer) {
		const targetPath =
			existing.outputPath ??
			workshopDraftTestcasePath(params.problemId, params.userId, existing.index, "output");
		await uploadFile(targetPath, params.newOutput, "text/plain");
		outputPath = targetPath;
	}

	const [updated] = await db
		.update(workshopTestcases)
		.set({
			subtaskGroup: params.subtaskGroup ?? existing.subtaskGroup,
			score: params.score ?? existing.score,
			outputPath,
			validationStatus: params.newInput ? "pending" : existing.validationStatus,
		})
		.where(eq(workshopTestcases.id, params.testcaseId))
		.returning();
	return updated;
}

/**
 * Delete a manual testcase AND reindex the remaining testcases to 1..N.
 *
 * Steps:
 *  1. Delete the target row's MinIO input/output objects.
 *  2. In a DB transaction:
 *     - Delete the target row.
 *     - Re-assign `index` to the remaining rows in ascending order (1..N).
 *  3. Outside the transaction, rename the MinIO objects for any row whose
 *     index changed (download+upload to the new key, then delete the old key).
 *     This happens best-effort — if a rename fails, we log and continue so
 *     the DB state isn't left inconsistent. The UI will surface a generic
 *     warning and a subsequent edit of the row will rewrite the files.
 *
 * Note: S3/MinIO has no native rename. We use download-then-upload rather
 * than CopyObject to avoid needing an additional S3 permission surface.
 */
export async function deleteTestcase(params: {
	problemId: number;
	userId: number;
	draftId: number;
	testcaseId: number;
}): Promise<void> {
	const { problemId, userId, draftId, testcaseId } = params;
	const existing = await getTestcase(testcaseId, draftId);
	if (!existing) throw new Error("테스트케이스를 찾을 수 없습니다");
	if (existing.source !== "manual") {
		throw new Error("수동 테스트케이스만 삭제할 수 있습니다");
	}

	// 1. Delete target object(s) up front.
	await deleteFile(existing.inputPath);
	if (existing.outputPath) {
		await deleteFile(existing.outputPath);
	}

	// 2. Plan the reindex inside a transaction and persist new DB state.
	//    `renames` describes MinIO moves to perform after commit.
	type RenamePlan = {
		id: number;
		oldInputPath: string;
		newInputPath: string;
		oldOutputPath: string | null;
		newOutputPath: string | null;
	};
	const renames: RenamePlan[] = [];

	await db.transaction(async (tx) => {
		await tx.delete(workshopTestcases).where(eq(workshopTestcases.id, testcaseId));

		const remaining = await tx
			.select()
			.from(workshopTestcases)
			.where(eq(workshopTestcases.draftId, draftId))
			.orderBy(asc(workshopTestcases.index));

		for (let i = 0; i < remaining.length; i++) {
			const row = remaining[i];
			const newIndex = i + 1;
			if (row.index === newIndex && row.inputPath !== existing.inputPath) {
				continue;
			}
			const newInputPath = workshopDraftTestcasePath(problemId, userId, newIndex, "input");
			const newOutputPath = row.outputPath
				? workshopDraftTestcasePath(problemId, userId, newIndex, "output")
				: null;

			if (
				row.index !== newIndex ||
				row.inputPath !== newInputPath ||
				row.outputPath !== newOutputPath
			) {
				renames.push({
					id: row.id,
					oldInputPath: row.inputPath,
					newInputPath,
					oldOutputPath: row.outputPath,
					newOutputPath,
				});
				await tx
					.update(workshopTestcases)
					.set({
						index: newIndex,
						inputPath: newInputPath,
						outputPath: newOutputPath,
					})
					.where(eq(workshopTestcases.id, row.id));
			}
		}
	});

	// 3. Best-effort MinIO rename outside the transaction.
	for (const r of renames) {
		try {
			if (r.oldInputPath !== r.newInputPath) {
				const body = await downloadFile(r.oldInputPath);
				await uploadFile(r.newInputPath, body, "text/plain");
				await deleteFile(r.oldInputPath);
			}
			if (r.oldOutputPath && r.newOutputPath && r.oldOutputPath !== r.newOutputPath) {
				const body = await downloadFile(r.oldOutputPath);
				await uploadFile(r.newOutputPath, body, "text/plain");
				await deleteFile(r.oldOutputPath);
			}
		} catch (err) {
			console.error(
				`[workshop-testcases] MinIO rename failed for row ${r.id} (${r.oldInputPath} -> ${r.newInputPath}):`,
				err
			);
		}
	}
}

/**
 * Parse a ZIP buffer for filenames like "1.in" / "1.out" / "2.in" / "2.out"
 * (case-insensitive). Returns sorted pairs.
 * - `.in` files are required; `.out` files are optional for a given index.
 * - Leading zeros tolerated (e.g. "01.in").
 * - Paths containing "/" are treated as nested — we use the basename only.
 */
export type ParsedZipPair = {
	index: number;
	input: Buffer;
	output: Buffer | null;
};

export async function parseTestcaseZip(zipBuffer: Buffer): Promise<ParsedZipPair[]> {
	const zip = await JSZip.loadAsync(zipBuffer);
	const inputs = new Map<number, Buffer>();
	const outputs = new Map<number, Buffer>();

	for (const [rawName, entry] of Object.entries(zip.files)) {
		if (entry.dir) continue;
		const basename = rawName.split("/").pop() ?? rawName;
		const m = /^(\d+)\.(in|out)$/i.exec(basename);
		if (!m) continue;
		const idx = Number.parseInt(m[1], 10);
		if (!Number.isFinite(idx) || idx <= 0) continue;
		const buf = Buffer.from(await entry.async("uint8array"));
		if (m[2].toLowerCase() === "in") {
			inputs.set(idx, buf);
		} else {
			outputs.set(idx, buf);
		}
	}

	const pairs: ParsedZipPair[] = [];
	for (const idx of [...inputs.keys()].sort((a, b) => a - b)) {
		pairs.push({
			index: idx,
			input: inputs.get(idx) as Buffer,
			output: outputs.get(idx) ?? null,
		});
	}
	if (pairs.length === 0) {
		throw new Error("ZIP에서 유효한 {N}.in 파일을 찾지 못했습니다");
	}
	return pairs;
}

/**
 * Bulk-create manual testcases from a parsed ZIP. Each pair is appended with a
 * fresh index (continuing after the current max — original zip indices are NOT
 * preserved, to avoid collisions with existing rows).
 */
export async function bulkCreateManualTestcases(params: {
	problemId: number;
	userId: number;
	draftId: number;
	pairs: ParsedZipPair[];
	defaultScore?: number;
	defaultSubtaskGroup?: number;
}): Promise<WorkshopTestcase[]> {
	for (const p of params.pairs) {
		if (p.input.byteLength > MAX_TESTCASE_BYTES) {
			throw new Error(`ZIP 내 ${p.index}.in 이 50MB를 초과합니다`);
		}
		if (p.output && p.output.byteLength > MAX_TESTCASE_BYTES) {
			throw new Error(`ZIP 내 ${p.index}.out 이 50MB를 초과합니다`);
		}
	}

	const startIndex = await nextManualIndex(params.draftId);
	const uploaded: WorkshopTestcase[] = [];
	const uploadedPaths: string[] = [];
	try {
		for (let i = 0; i < params.pairs.length; i++) {
			const assignedIndex = startIndex + i;
			const inputPath = workshopDraftTestcasePath(
				params.problemId,
				params.userId,
				assignedIndex,
				"input"
			);
			await uploadFile(inputPath, params.pairs[i].input, "text/plain");
			uploadedPaths.push(inputPath);
			let outputPath: string | null = null;
			if (params.pairs[i].output) {
				outputPath = workshopDraftTestcasePath(
					params.problemId,
					params.userId,
					assignedIndex,
					"output"
				);
				await uploadFile(outputPath, params.pairs[i].output as Buffer, "text/plain");
				uploadedPaths.push(outputPath);
			}
			const [row] = await db
				.insert(workshopTestcases)
				.values({
					draftId: params.draftId,
					index: assignedIndex,
					source: "manual",
					inputPath,
					outputPath,
					subtaskGroup: params.defaultSubtaskGroup ?? 0,
					score: params.defaultScore ?? 0,
					validationStatus: "pending",
				})
				.returning();
			uploaded.push(row);
		}
		return uploaded;
	} catch (err) {
		// Best-effort cleanup of MinIO objects if any step failed mid-way.
		for (const p of uploadedPaths) {
			try {
				await deleteFile(p);
			} catch {}
		}
		if (uploaded.length > 0) {
			await db
				.delete(workshopTestcases)
				.where(eq(workshopTestcases.draftId, params.draftId))
				.returning();
		}
		throw err;
	}
}

/**
 * Summary counts for the dashboard overview.
 */
export async function countTestcasesForDraft(draftId: number): Promise<number> {
	const rows = await db
		.select({ id: workshopTestcases.id })
		.from(workshopTestcases)
		.where(eq(workshopTestcases.draftId, draftId))
		.orderBy(desc(workshopTestcases.id));
	return rows.length;
}
