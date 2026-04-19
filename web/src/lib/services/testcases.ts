import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { testcases } from "@/db/schema";
import { generateTestcasePath, uploadFile } from "@/lib/storage";

export async function getTestcases(problemId: number) {
	return db
		.select()
		.from(testcases)
		.where(eq(testcases.problemId, problemId))
		.orderBy(testcases.id);
}

export async function createTestcase(data: {
	problemId: number;
	inputPath: string;
	outputPath: string;
	subtaskGroup?: number;
	isHidden?: boolean;
	score?: number;
}) {
	const [newTestcase] = await db.insert(testcases).values(data).returning();
	return newTestcase;
}

export async function deleteTestcase(id: number) {
	await db.delete(testcases).where(eq(testcases.id, id));
	return { success: true };
}

export async function uploadTestcase(
	problemId: number,
	inputBuffer: Buffer,
	outputBuffer: Buffer,
	options?: { score?: number; isHidden?: boolean }
) {
	const [countResult] = await db
		.select({ count: count() })
		.from(testcases)
		.where(eq(testcases.problemId, problemId));

	const nextIndex = countResult.count + 1;

	const inputPath = generateTestcasePath(problemId, nextIndex, "input");
	const outputPath = generateTestcasePath(problemId, nextIndex, "output");

	await Promise.all([
		uploadFile(inputPath, inputBuffer, "application/octet-stream"),
		uploadFile(outputPath, outputBuffer, "application/octet-stream"),
	]);

	const [newTestcase] = await db
		.insert(testcases)
		.values({
			problemId,
			inputPath,
			outputPath,
			score: options?.score ?? 0,
			isHidden: options?.isHidden ?? true,
		})
		.returning();

	return newTestcase;
}

export async function uploadTestcasesBulk(
	problemId: number,
	pairs: Array<{
		inputBuffer: Buffer;
		outputBuffer: Buffer;
		score?: number;
		isHidden?: boolean;
	}>
) {
	if (pairs.length === 0) return [];

	const [countResult] = await db
		.select({ count: count() })
		.from(testcases)
		.where(eq(testcases.problemId, problemId));

	const startIndex = countResult.count + 1;

	const prepared = pairs.map((p, i) => ({
		inputBuffer: p.inputBuffer,
		outputBuffer: p.outputBuffer,
		score: p.score ?? 0,
		isHidden: p.isHidden ?? true,
		inputPath: generateTestcasePath(problemId, startIndex + i, "input"),
		outputPath: generateTestcasePath(problemId, startIndex + i, "output"),
	}));

	await Promise.all(
		prepared.flatMap((p) => [
			uploadFile(p.inputPath, p.inputBuffer, "application/octet-stream"),
			uploadFile(p.outputPath, p.outputBuffer, "application/octet-stream"),
		])
	);

	return db
		.insert(testcases)
		.values(
			prepared.map((p) => ({
				problemId,
				inputPath: p.inputPath,
				outputPath: p.outputPath,
				score: p.score,
				isHidden: p.isHidden,
			}))
		)
		.returning();
}

/** Normalize line endings: CRLF -> LF, CR -> LF */
export function normalizeLineEndings(buffer: Buffer, filename: string): Buffer {
	const isTextFile = /\.(txt|in|out|ans|answer)$/i.test(filename);
	if (isTextFile) {
		const text = buffer.toString("utf-8");
		const normalized = `${text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()}\n`;
		return Buffer.from(normalized, "utf-8");
	}
	return buffer;
}
