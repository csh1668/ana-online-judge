import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { problems, testcases } from "@/db/schema";
import { generateTestcasePath, uploadFile } from "@/lib/storage";
import { recomputeProblemSubtaskMeta } from "./problem-subtask-meta";

/**
 * Reject mutations that would assign a non-zero `subtaskGroup` to a
 * testcase belonging to a full-judge problem.
 *
 * `recomputeProblemSubtaskMeta` flips `problems.hasSubtasks` to true
 * whenever any testcase has `subtaskGroup > 0`, which would coexist with
 * `useFullJudge=true` and silently get ignored by the judger (the
 * subtask branch takes priority). Block this conflict at the source.
 */
async function assertCompatibleSubtaskGroup(problemId: number, subtaskGroup: number | undefined) {
	if (subtaskGroup === undefined || subtaskGroup === 0) return;
	const [problem] = await db
		.select({ useFullJudge: problems.useFullJudge })
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);
	if (problem?.useFullJudge) {
		throw new Error(
			"전체 채점 문제는 서브테스크 그룹(0이 아닌 subtaskGroup)을 가질 수 없습니다. 먼저 전체 채점을 해제해주세요."
		);
	}
}

/**
 * Keep `problems.passThreshold` consistent after a testcase mutation on
 * a full-judge problem.
 *
 * - If all testcases were removed, clear `passThreshold` back to null.
 * - If this is the first testcase upload (passThreshold still null on a
 *   full-judge problem), seed `passThreshold = N` as a safe default.
 * - If the resulting count drops below the existing `passThreshold`, throw
 *   so the caller (and surrounding transactionless flow) refuses the change.
 *   Pre-flight checks in destructive mutators avoid uploading/deleting files
 *   that would later be rejected here.
 *
 * No-op for problems where `useFullJudge` is false.
 */
async function reconcileFullJudgeAfterTestcaseChange(problemId: number) {
	const [tcCountRow] = await db
		.select({ count: count() })
		.from(testcases)
		.where(eq(testcases.problemId, problemId));
	const tcCount = tcCountRow?.count ?? 0;

	const [problem] = await db
		.select({
			useFullJudge: problems.useFullJudge,
			passThreshold: problems.passThreshold,
		})
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);

	if (!problem?.useFullJudge) return;

	if (tcCount === 0) {
		if (problem.passThreshold !== null) {
			await db.update(problems).set({ passThreshold: null }).where(eq(problems.id, problemId));
		}
		return;
	}

	if (problem.passThreshold === null) {
		await db.update(problems).set({ passThreshold: tcCount }).where(eq(problems.id, problemId));
		return;
	}

	if (problem.passThreshold > tcCount) {
		throw new Error(
			`통과 기준(${problem.passThreshold})보다 테스트케이스가 적어집니다(${tcCount}). 먼저 통과 기준을 ${tcCount} 이하로 낮춰주세요.`
		);
	}
}

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
	await assertCompatibleSubtaskGroup(data.problemId, data.subtaskGroup);
	const [newTestcase] = await db.insert(testcases).values(data).returning();
	await recomputeProblemSubtaskMeta(data.problemId);
	await reconcileFullJudgeAfterTestcaseChange(data.problemId);
	return newTestcase;
}

export async function deleteTestcase(id: number) {
	const [row] = await db
		.select({ problemId: testcases.problemId })
		.from(testcases)
		.where(eq(testcases.id, id));

	if (row) {
		// Pre-flight: refuse the delete if it would push the testcase count
		// below the configured passThreshold for a full-judge problem.
		const [tcCountRow] = await db
			.select({ count: count() })
			.from(testcases)
			.where(eq(testcases.problemId, row.problemId));
		const nextN = (tcCountRow?.count ?? 0) - 1;

		const [problem] = await db
			.select({
				useFullJudge: problems.useFullJudge,
				passThreshold: problems.passThreshold,
			})
			.from(problems)
			.where(eq(problems.id, row.problemId))
			.limit(1);

		if (
			problem?.useFullJudge &&
			problem.passThreshold !== null &&
			nextN > 0 &&
			problem.passThreshold > nextN
		) {
			throw new Error(
				`통과 기준(${problem.passThreshold})보다 테스트케이스가 적어집니다(${nextN}). 먼저 통과 기준을 ${nextN} 이하로 낮춰주세요.`
			);
		}
	}

	await db.delete(testcases).where(eq(testcases.id, id));
	if (row) {
		await recomputeProblemSubtaskMeta(row.problemId);
		await reconcileFullJudgeAfterTestcaseChange(row.problemId);
	}
	return { success: true };
}

export async function uploadTestcase(
	problemId: number,
	inputBuffer: Buffer,
	outputBuffer: Buffer,
	options?: { score?: number; isHidden?: boolean; subtaskGroup?: number }
) {
	await assertCompatibleSubtaskGroup(problemId, options?.subtaskGroup);

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
			...(options?.subtaskGroup !== undefined ? { subtaskGroup: options.subtaskGroup } : {}),
		})
		.returning();

	await recomputeProblemSubtaskMeta(problemId);
	await reconcileFullJudgeAfterTestcaseChange(problemId);
	return newTestcase;
}

export async function uploadTestcasesBulk(
	problemId: number,
	pairs: Array<{
		inputBuffer: Buffer;
		outputBuffer: Buffer;
		score?: number;
		isHidden?: boolean;
		subtaskGroup?: number;
	}>
) {
	if (pairs.length === 0) return [];

	if (pairs.some((p) => p.subtaskGroup !== undefined && p.subtaskGroup > 0)) {
		// One DB lookup is enough — same problemId for the whole batch.
		await assertCompatibleSubtaskGroup(problemId, 1);
	}

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
		subtaskGroup: p.subtaskGroup,
		inputPath: generateTestcasePath(problemId, startIndex + i, "input"),
		outputPath: generateTestcasePath(problemId, startIndex + i, "output"),
	}));

	await Promise.all(
		prepared.flatMap((p) => [
			uploadFile(p.inputPath, p.inputBuffer, "application/octet-stream"),
			uploadFile(p.outputPath, p.outputBuffer, "application/octet-stream"),
		])
	);

	const inserted = await db
		.insert(testcases)
		.values(
			prepared.map((p) => ({
				problemId,
				inputPath: p.inputPath,
				outputPath: p.outputPath,
				score: p.score,
				isHidden: p.isHidden,
				...(p.subtaskGroup !== undefined ? { subtaskGroup: p.subtaskGroup } : {}),
			}))
		)
		.returning();
	await recomputeProblemSubtaskMeta(problemId);
	await reconcileFullJudgeAfterTestcaseChange(problemId);
	return inserted;
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

export async function updateTestcase(
	id: number,
	data: { score?: number; subtaskGroup?: number; isHidden?: boolean }
) {
	const [row] = await db
		.select({ problemId: testcases.problemId })
		.from(testcases)
		.where(eq(testcases.id, id));
	if (!row) return null;

	await assertCompatibleSubtaskGroup(row.problemId, data.subtaskGroup);

	const [updated] = await db
		.update(testcases)
		.set({
			...(data.score !== undefined ? { score: data.score } : {}),
			...(data.subtaskGroup !== undefined ? { subtaskGroup: data.subtaskGroup } : {}),
			...(data.isHidden !== undefined ? { isHidden: data.isHidden } : {}),
		})
		.where(eq(testcases.id, id))
		.returning();
	await recomputeProblemSubtaskMeta(row.problemId);
	await reconcileFullJudgeAfterTestcaseChange(row.problemId);
	return updated;
}
