import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import JSZip from "jszip";
import { db } from "@/db";
import { type WorkshopTestcase, workshopTestcases } from "@/db/schema";
import {
	deleteFile,
	downloadFile,
	listObjectsWithDetails,
	uploadFile,
} from "@/lib/storage/operations";
import { withDraftLock } from "@/lib/workshop/draft-lock";
import { workshopDraftBase, workshopDraftTestcaseFilePath } from "@/lib/workshop/paths";

const MAX_TESTCASE_BYTES = 50 * 1024 * 1024; // 50MB per file
const MAX_TESTCASES_PER_DRAFT = 200;
const MAX_TOTAL_TESTCASE_BYTES = 512 * 1024 * 1024; // 512MB per draft
const PREVIEW_BYTE_LIMIT = 200 * 1024; // 200KB for preview

/**
 * Throw if writing testcases would push the draft over the configured
 * aggregate stored-bytes cap. This is advisory-only (MinIO listing can't join
 * the DB tx) — the authoritative row-count cap is enforced inside the
 * per-draft advisory-lock transaction, see the `count()` checks below.
 *
 * `newSizesByKey` lists the keys that will be (over)written by the current
 * operation and their resulting byte sizes. Keys already in MinIO with sizes
 * absent from this map count toward the total; keys present in the map use
 * the supplied size (i.e. the simulated post-write state).
 */
async function assertTestcaseCapacity(args: {
	problemId: number;
	userId: number;
	draftId: number;
	newSizesByKey: Map<string, number>;
}): Promise<void> {
	const prefix = `${workshopDraftBase(args.problemId, args.userId)}/testcases/`;
	const existing = await listObjectsWithDetails(prefix);
	let total = 0;
	for (const o of existing) {
		if (!args.newSizesByKey.has(o.key)) total += o.size;
	}
	for (const size of args.newSizesByKey.values()) total += size;
	if (total > MAX_TOTAL_TESTCASE_BYTES) {
		const mb = Math.floor(MAX_TOTAL_TESTCASE_BYTES / (1024 * 1024));
		throw new Error(`테스트케이스 총 용량은 ${mb}MB 를 초과할 수 없습니다`);
	}
}

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
	// Byte-capacity pre-check (advisory; MinIO listing can't join the DB tx).
	await assertTestcaseCapacity({
		problemId: input.problemId,
		userId: input.userId,
		draftId: input.draftId,
		newSizesByKey: new Map(),
	});

	const created = await withDraftLock(input.draftId, async (tx) => {
		const [countRow] = await tx
			.select({ value: count() })
			.from(workshopTestcases)
			.where(eq(workshopTestcases.draftId, input.draftId));
		if ((countRow?.value ?? 0) + 1 > MAX_TESTCASES_PER_DRAFT) {
			throw new Error(
				`테스트케이스는 draft당 최대 ${MAX_TESTCASES_PER_DRAFT}개까지 추가할 수 있습니다`
			);
		}
		const [row] = await tx
			.select({ maxIndex: max(workshopTestcases.index) })
			.from(workshopTestcases)
			.where(eq(workshopTestcases.draftId, input.draftId));
		const index = (row?.maxIndex ?? 0) + 1;
		const [inserted] = await tx
			.insert(workshopTestcases)
			.values({
				draftId: input.draftId,
				index,
				source: "manual",
				inputPath: "",
				outputPath: null,
				subtaskGroup: input.subtaskGroup ?? 0,
				score: input.score ?? 0,
				validationStatus: "pending",
			})
			.returning();
		const inputPath = workshopDraftTestcaseFilePath(
			input.problemId,
			input.userId,
			inserted.id,
			"input"
		);
		const outputPath = input.output
			? workshopDraftTestcaseFilePath(input.problemId, input.userId, inserted.id, "output")
			: null;
		const [updated] = await tx
			.update(workshopTestcases)
			.set({ inputPath, outputPath })
			.where(eq(workshopTestcases.id, inserted.id))
			.returning();
		return updated;
	});

	try {
		await uploadFile(created.inputPath, input.input, "text/plain");
		if (input.output && created.outputPath) {
			await uploadFile(created.outputPath, input.output, "text/plain");
		}
	} catch (err) {
		await db.delete(workshopTestcases).where(eq(workshopTestcases.id, created.id));
		throw err;
	}
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

	if (params.newInput || params.newOutput instanceof Buffer) {
		const plannedSizes = new Map<string, number>();
		if (params.newInput) {
			plannedSizes.set(existing.inputPath, params.newInput.byteLength);
		}
		if (params.newOutput instanceof Buffer) {
			const targetOutputPath =
				existing.outputPath ??
				workshopDraftTestcaseFilePath(params.problemId, params.userId, existing.id, "output");
			plannedSizes.set(targetOutputPath, params.newOutput.byteLength);
		}
		await assertTestcaseCapacity({
			problemId: params.problemId,
			userId: params.userId,
			draftId: params.draftId,
			newSizesByKey: plannedSizes,
		});
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
			workshopDraftTestcaseFilePath(params.problemId, params.userId, existing.id, "output");
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
 * File keys embed the immutable row id, not the display index, so reindexing
 * is a DB-only operation — no MinIO rename is needed (or possible to race
 * with a late-arriving judge upload).
 */
export async function deleteTestcase(params: {
	problemId: number;
	userId: number;
	draftId: number;
	testcaseId: number;
}): Promise<void> {
	const { draftId, testcaseId } = params;
	const existing = await getTestcase(testcaseId, draftId);
	if (!existing) throw new Error("테스트케이스를 찾을 수 없습니다");
	if (existing.source !== "manual") {
		throw new Error("수동 테스트케이스만 삭제할 수 있습니다");
	}

	// Reindex is DB-only now — file keys embed the row id, not the index.
	await withDraftLock(draftId, async (tx) => {
		await tx.delete(workshopTestcases).where(eq(workshopTestcases.id, testcaseId));
		const remaining = await tx
			.select({ id: workshopTestcases.id, index: workshopTestcases.index })
			.from(workshopTestcases)
			.where(eq(workshopTestcases.draftId, draftId))
			.orderBy(asc(workshopTestcases.index));
		for (let i = 0; i < remaining.length; i++) {
			const newIndex = i + 1;
			if (remaining[i].index !== newIndex) {
				await tx
					.update(workshopTestcases)
					.set({ index: newIndex })
					.where(eq(workshopTestcases.id, remaining[i].id));
			}
		}
	});

	try {
		await deleteFile(existing.inputPath);
	} catch {}
	if (existing.outputPath) {
		try {
			await deleteFile(existing.outputPath);
		} catch {}
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

	// Byte-capacity pre-check (advisory; MinIO listing can't join the DB tx).
	await assertTestcaseCapacity({
		problemId: params.problemId,
		userId: params.userId,
		draftId: params.draftId,
		newSizesByKey: new Map(),
	});

	const rows = await withDraftLock(params.draftId, async (tx) => {
		const [countRow] = await tx
			.select({ value: count() })
			.from(workshopTestcases)
			.where(eq(workshopTestcases.draftId, params.draftId));
		if ((countRow?.value ?? 0) + params.pairs.length > MAX_TESTCASES_PER_DRAFT) {
			throw new Error(
				`테스트케이스는 draft당 최대 ${MAX_TESTCASES_PER_DRAFT}개까지 추가할 수 있습니다`
			);
		}
		const [maxRow] = await tx
			.select({ maxIndex: max(workshopTestcases.index) })
			.from(workshopTestcases)
			.where(eq(workshopTestcases.draftId, params.draftId));
		const startIndex = (maxRow?.maxIndex ?? 0) + 1;

		const inserted: WorkshopTestcase[] = [];
		for (let i = 0; i < params.pairs.length; i++) {
			const [row] = await tx
				.insert(workshopTestcases)
				.values({
					draftId: params.draftId,
					index: startIndex + i,
					source: "manual",
					inputPath: "",
					outputPath: null,
					subtaskGroup: params.defaultSubtaskGroup ?? 0,
					score: params.defaultScore ?? 0,
					validationStatus: "pending",
				})
				.returning();
			const inputPath = workshopDraftTestcaseFilePath(
				params.problemId,
				params.userId,
				row.id,
				"input"
			);
			const outputPath = params.pairs[i].output
				? workshopDraftTestcaseFilePath(params.problemId, params.userId, row.id, "output")
				: null;
			const [updated] = await tx
				.update(workshopTestcases)
				.set({ inputPath, outputPath })
				.where(eq(workshopTestcases.id, row.id))
				.returning();
			inserted.push(updated);
		}
		return inserted;
	});

	const uploaded: WorkshopTestcase[] = [];
	const uploadedPaths: string[] = [];
	try {
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			await uploadFile(row.inputPath, params.pairs[i].input, "text/plain");
			uploadedPaths.push(row.inputPath);
			if (params.pairs[i].output && row.outputPath) {
				await uploadFile(row.outputPath, params.pairs[i].output as Buffer, "text/plain");
				uploadedPaths.push(row.outputPath);
			}
			uploaded.push(row);
		}
		return uploaded;
	} catch (err) {
		// Best-effort cleanup of MinIO objects if any step failed mid-way. All
		// `rows` were already committed to the DB by the lock tx above (as
		// placeholders), so every row — not just the ones whose upload
		// succeeded — must be removed.
		for (const p of uploadedPaths) {
			try {
				await deleteFile(p);
			} catch {}
		}
		const rowIds = rows.map((r) => r.id);
		await db.delete(workshopTestcases).where(inArray(workshopTestcases.id, rowIds));
		throw err;
	}
}

export type TestcasePreviewPart = {
	text: string;
	size: number;
	truncated: boolean;
};

export type TestcasePreview = {
	index: number;
	input: TestcasePreviewPart;
	output: TestcasePreviewPart | null;
};

/**
 * Read input/output content for a single testcase, truncated to PREVIEW_BYTE_LIMIT.
 * Used by the testcases page preview dialog.
 */
export async function readTestcaseContent(args: {
	draftId: number;
	testcaseId: number;
}): Promise<TestcasePreview> {
	const tc = await getTestcase(args.testcaseId, args.draftId);
	if (!tc) throw new Error("테스트케이스를 찾을 수 없습니다");
	const input = await readPreviewPart(tc.inputPath);
	const output = tc.outputPath ? await readPreviewPart(tc.outputPath) : null;
	return { index: tc.index, input, output };
}

async function readPreviewPart(path: string): Promise<TestcasePreviewPart> {
	const buf = await downloadFile(path);
	const truncated = buf.length > PREVIEW_BYTE_LIMIT;
	const slice = truncated ? buf.subarray(0, PREVIEW_BYTE_LIMIT) : buf;
	return { text: slice.toString("utf-8"), size: buf.length, truncated };
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
