import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopInvocation,
	type WorkshopProblem,
	workshopInvocations,
	workshopProblems,
	workshopResources,
	workshopSolutions,
	workshopTestcases,
} from "@/db/schema";
import {
	pushWorkshopInvokeJob,
	type WorkshopInvokeChecker,
	type WorkshopInvokeResource,
} from "@/lib/judge-queue";
import { downloadFile } from "@/lib/storage/operations";
import { startInvocationSubscriber } from "@/lib/workshop/invocation-subscriber";
import { workshopDraftTestcasePath, workshopInvocationOutputPath } from "@/lib/workshop/paths";

/**
 * Shape of `selectedSolutionsJson` -- snapshot of selected solutions at
 * invocation creation time (spec S2). Rendered as matrix rows in UI.
 */
export type InvocationSolutionSnapshot = {
	id: number;
	name: string;
	language: string;
	expectedVerdict: string;
};

/**
 * Shape of `selectedTestcasesJson` -- snapshot of selected testcases at
 * invocation creation time. Matrix columns.
 */
export type InvocationTestcaseSnapshot = {
	id: number;
	index: number;
	inputHash: string;
	outputHash: string | null;
};

async function sha256OfKey(key: string): Promise<string> {
	const buf = await downloadFile(key);
	return createHash("sha256").update(buf).digest("hex");
}

/**
 * Result returned to the caller of `createInvocation` / `generateAnswers`.
 */
export type CreateInvocationResult = {
	invocationId: number;
};

export type PreconditionFailure = {
	reason:
		| "no_main_solution"
		| "no_testcases"
		| "missing_outputs"
		| "invalid_selection"
		| "no_solutions_selected"
		| "no_testcases_selected";
	message: string;
	missingTestcaseIds?: number[];
};

export class InvocationPreconditionError extends Error {
	public readonly failure: PreconditionFailure;
	constructor(failure: PreconditionFailure) {
		super(failure.message);
		this.failure = failure;
	}
}

/**
 * Compute which preconditions (if any) are blocking a "Run Invocation" call.
 * Returns null if the call is allowed, a PreconditionFailure otherwise.
 * Exposed for the UI (disabled-button tooltip).
 */
export async function checkInvocationPrecondition(params: {
	draftId: number;
	selectedSolutionIds: number[];
	selectedTestcaseIds: number[];
}): Promise<PreconditionFailure | null> {
	const { draftId, selectedSolutionIds, selectedTestcaseIds } = params;
	if (selectedSolutionIds.length === 0) {
		return { reason: "no_solutions_selected", message: "실행할 솔루션을 선택하세요" };
	}
	if (selectedTestcaseIds.length === 0) {
		return { reason: "no_testcases_selected", message: "실행할 테스트를 선택하세요" };
	}

	const [main] = await db
		.select({ id: workshopSolutions.id })
		.from(workshopSolutions)
		.where(and(eq(workshopSolutions.draftId, draftId), eq(workshopSolutions.isMain, true)))
		.limit(1);
	if (!main) {
		return {
			reason: "no_main_solution",
			message: "메인 솔루션(isMain=true)이 필요합니다. 솔루션 탭에서 지정하세요",
		};
	}

	const testcases = await db
		.select({ id: workshopTestcases.id, outputPath: workshopTestcases.outputPath })
		.from(workshopTestcases)
		.where(
			and(
				eq(workshopTestcases.draftId, draftId),
				inArray(workshopTestcases.id, selectedTestcaseIds)
			)
		);
	if (testcases.length !== selectedTestcaseIds.length) {
		return { reason: "invalid_selection", message: "유효하지 않은 테스트가 포함되어 있습니다" };
	}
	const missing = testcases.filter((t) => t.outputPath === null).map((t) => t.id);
	if (missing.length > 0) {
		return {
			reason: "missing_outputs",
			message: `정답(output.txt)이 없는 테스트가 ${missing.length}개 있습니다. "정답 생성"을 먼저 실행하세요`,
			missingTestcaseIds: missing,
		};
	}

	// Solution validity check
	const solutions = await db
		.select({ id: workshopSolutions.id })
		.from(workshopSolutions)
		.where(
			and(
				eq(workshopSolutions.draftId, draftId),
				inArray(workshopSolutions.id, selectedSolutionIds)
			)
		);
	if (solutions.length !== selectedSolutionIds.length) {
		return { reason: "invalid_selection", message: "유효하지 않은 솔루션이 포함되어 있습니다" };
	}

	return null;
}

/**
 * Load the full context needed to build `workshop_invoke` payloads:
 * problem metadata, resource list, checker config, and -- for the caller's
 * use -- the current draft.
 */
async function loadProblemContext(
	problemId: number,
	draftId: number
): Promise<{
	problem: WorkshopProblem;
	resources: WorkshopInvokeResource[];
}> {
	const [problem] = await db
		.select()
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!problem) throw new Error("문제를 찾을 수 없습니다");

	const resRows = await db
		.select({ name: workshopResources.name, path: workshopResources.path })
		.from(workshopResources)
		.where(eq(workshopResources.draftId, draftId));
	const resources: WorkshopInvokeResource[] = resRows.map((r) => ({
		name: r.name,
		storage_path: r.path,
	}));

	return { problem, resources };
}

/**
 * Build the checker payload from workshopProblems metadata.
 * MVP: cpp only (Phase 3 spec). If checkerLanguage is "python", we pass null
 * (judge falls back to ICPC compare) -- with a warning log, since validator
 * pages should have prevented this.
 */
function buildCheckerPayload(problem: WorkshopProblem): WorkshopInvokeChecker | null {
	if (!problem.checkerPath) return null;
	if (problem.checkerLanguage !== "cpp") {
		console.warn(
			`Workshop problem ${problem.id} has non-cpp checker language ${problem.checkerLanguage}; falling back to ICPC compare`
		);
		return null;
	}
	return { language: "cpp", source_path: problem.checkerPath };
}

/**
 * Create a normal invocation (user clicked "Run Invocation"). Snapshots
 * selection, persists the running row, enqueues NxM jobs, starts a Redis
 * subscriber for live SSE, returns the invocationId.
 *
 * Throws InvocationPreconditionError on precondition failure.
 */
export async function createInvocation(params: {
	problemId: number;
	userId: number;
	draftId: number;
	selectedSolutionIds: number[];
	selectedTestcaseIds: number[];
}): Promise<CreateInvocationResult> {
	const { problemId, userId, draftId, selectedSolutionIds, selectedTestcaseIds } = params;

	const failure = await checkInvocationPrecondition({
		draftId,
		selectedSolutionIds,
		selectedTestcaseIds,
	});
	if (failure) throw new InvocationPreconditionError(failure);

	// Load full solution and testcase rows for the snapshot + job payloads.
	const solutions = await db
		.select()
		.from(workshopSolutions)
		.where(
			and(
				eq(workshopSolutions.draftId, draftId),
				inArray(workshopSolutions.id, selectedSolutionIds)
			)
		);
	const testcases = await db
		.select()
		.from(workshopTestcases)
		.where(
			and(
				eq(workshopTestcases.draftId, draftId),
				inArray(workshopTestcases.id, selectedTestcaseIds)
			)
		);

	const solutionSnapshot: InvocationSolutionSnapshot[] = solutions.map((s) => ({
		id: s.id,
		name: s.name,
		language: s.language,
		expectedVerdict: s.expectedVerdict,
	}));
	const sortedTestcases = testcases.slice().sort((a, b) => a.index - b.index);
	const testcaseSnapshot: InvocationTestcaseSnapshot[] = await Promise.all(
		sortedTestcases.map(async (t) => ({
			id: t.id,
			index: t.index,
			inputHash: await sha256OfKey(t.inputPath),
			outputHash: t.outputPath ? await sha256OfKey(t.outputPath) : null,
		}))
	);

	const { problem, resources } = await loadProblemContext(problemId, draftId);

	// Persist the running row FIRST (serial id assigned by Postgres).
	const [invocation] = await db
		.insert(workshopInvocations)
		.values({
			workshopProblemId: problemId,
			status: "running",
			selectedSolutionsJson: solutionSnapshot,
			selectedTestcasesJson: testcaseSnapshot,
			resultsJson: [],
			createdBy: userId,
		})
		.returning();

	const invocationId = invocation.id;
	const checker = buildCheckerPayload(problem);

	// Map of (solutionId_testcaseId) -> MinIO upload key, so the subscriber
	// can stash outputRef in each cell result.
	const invocationOutputKeys = new Map<string, string>();

	// Enqueue NxM jobs.
	for (const solution of solutions) {
		for (const testcase of testcases) {
			const jobId = `${invocationId}:${solution.id}:${testcase.id}`;
			const uploadPath = workshopInvocationOutputPath(
				problemId,
				invocationId,
				solution.id,
				testcase.id
			);
			invocationOutputKeys.set(`${solution.id}_${testcase.id}`, uploadPath);

			await pushWorkshopInvokeJob({
				jobId,
				problemId,
				userId,
				invocationId,
				solutionId: solution.id,
				testcaseId: testcase.id,
				language: solution.language,
				solutionSourcePath: solution.sourcePath,
				inputPath: testcase.inputPath,
				answerPath: testcase.outputPath, // precondition guarantees non-null
				resources,
				checker,
				baseTimeLimitMs: problem.timeLimit,
				baseMemoryLimitMb: problem.memoryLimit,
				stdoutUploadPath: uploadPath,
			});
		}
	}

	await startInvocationSubscriber({
		problemId,
		invocationId,
		expectedCellCount: solutions.length * testcases.length,
		invocationOutputKeys,
	});

	return { invocationId };
}

/**
 * Special invocation: run the isMain=true solution against ALL testcases
 * WITHOUT a checker. Each job's stdout_upload_path is the testcase's
 * outputPath -- so on AC, the testcase's output.txt is overwritten in place.
 *
 * Precondition (hard):
 * - isMain=true solution exists
 * - at least one testcase exists
 *
 * Does NOT require that testcases already have outputs -- this is how you
 * fill them.
 *
 * Edge case: if a testcase had outputPath=null before, we pre-compute the
 * path and write it into the DB row at enqueue time, so the subscriber's
 * cell outputRef (the same key) matches what's now referenced from
 * workshopTestcases.outputPath. The judge writes to MinIO; the DB row is
 * updated here at enqueue time.
 */
export async function generateAnswers(params: {
	problemId: number;
	userId: number;
	draftId: number;
}): Promise<CreateInvocationResult> {
	const { problemId, userId, draftId } = params;

	const [main] = await db
		.select()
		.from(workshopSolutions)
		.where(and(eq(workshopSolutions.draftId, draftId), eq(workshopSolutions.isMain, true)))
		.limit(1);
	if (!main) {
		throw new InvocationPreconditionError({
			reason: "no_main_solution",
			message: "메인 솔루션(isMain=true)이 필요합니다",
		});
	}

	const testcases = await db
		.select()
		.from(workshopTestcases)
		.where(eq(workshopTestcases.draftId, draftId));
	if (testcases.length === 0) {
		throw new InvocationPreconditionError({
			reason: "no_testcases",
			message: "테스트케이스가 없습니다",
		});
	}

	const { problem, resources } = await loadProblemContext(problemId, draftId);

	// Snapshot -- only one row per axis.
	const solutionSnapshot: InvocationSolutionSnapshot[] = [
		{
			id: main.id,
			name: main.name,
			language: main.language,
			expectedVerdict: main.expectedVerdict,
		},
	];
	const sortedTcForSnapshot = testcases.slice().sort((a, b) => a.index - b.index);
	const testcaseSnapshot: InvocationTestcaseSnapshot[] = await Promise.all(
		sortedTcForSnapshot.map(async (t) => ({
			id: t.id,
			index: t.index,
			inputHash: await sha256OfKey(t.inputPath),
			outputHash: t.outputPath ? await sha256OfKey(t.outputPath) : null,
		}))
	);

	const [invocation] = await db
		.insert(workshopInvocations)
		.values({
			workshopProblemId: problemId,
			status: "running",
			selectedSolutionsJson: solutionSnapshot,
			selectedTestcasesJson: testcaseSnapshot,
			resultsJson: [],
			createdBy: userId,
		})
		.returning();

	const invocationId = invocation.id;
	const invocationOutputKeys = new Map<string, string>();

	for (const testcase of testcases) {
		const outputPath = workshopDraftTestcasePath(problemId, userId, testcase.index, "output");
		const jobId = `${invocationId}:${main.id}:${testcase.id}`;

		invocationOutputKeys.set(`${main.id}_${testcase.id}`, outputPath);

		await pushWorkshopInvokeJob({
			jobId,
			problemId,
			userId,
			invocationId,
			solutionId: main.id,
			testcaseId: testcase.id,
			language: main.language,
			solutionSourcePath: main.sourcePath,
			inputPath: testcase.inputPath,
			answerPath: null, // no checker comparison needed; judge runs plain
			resources,
			checker: null, // checker OFF -- answer generation path
			baseTimeLimitMs: problem.timeLimit,
			baseMemoryLimitMb: problem.memoryLimit,
			stdoutUploadPath: outputPath,
		});
	}

	// Start a *different* flavor of subscriber: on AC, additionally update
	// workshopTestcases.outputPath to the uploaded key. We route through
	// startInvocationSubscriber for the common path, then install an
	// additional listener via a one-off redis subscribe here.
	await startAnswerGenerationSubscriber({
		problemId,
		invocationId,
		expectedCellCount: testcases.length,
		draftId,
		testcaseOutputKeys: new Map(
			testcases.map((t) => [t.id, workshopDraftTestcasePath(problemId, userId, t.index, "output")])
		),
		invocationOutputKeys,
	});

	return { invocationId };
}

/**
 * Variant subscriber for answer generation: same append-cell-to-resultsJson behavior
 * as the normal subscriber, but ALSO updates `workshopTestcases.outputPath`
 * when a cell returns AC for a testcase that previously had no output.
 *
 * The output-promotion side effect is wired in via `onCellResult` so a single
 * Redis subscriber handles both append+SSE+finalize and the AC -> outputPath
 * promotion (avoids opening a second Redis connection).
 */
async function startAnswerGenerationSubscriber(params: {
	problemId: number;
	invocationId: number;
	expectedCellCount: number;
	draftId: number;
	testcaseOutputKeys: Map<number, string>;
	invocationOutputKeys: Map<string, string>;
}): Promise<void> {
	await startInvocationSubscriber({
		problemId: params.problemId,
		invocationId: params.invocationId,
		expectedCellCount: params.expectedCellCount,
		invocationOutputKeys: params.invocationOutputKeys,
		onCellResult: async (cell) => {
			if (cell.verdict === "accepted") {
				const path = params.testcaseOutputKeys.get(cell.testcaseId);
				if (path) {
					await db
						.update(workshopTestcases)
						.set({ outputPath: path })
						.where(eq(workshopTestcases.id, cell.testcaseId));
				}
			}
		},
	});
}

export async function listInvocations(
	workshopProblemId: number,
	limit = 20
): Promise<WorkshopInvocation[]> {
	return db
		.select()
		.from(workshopInvocations)
		.where(eq(workshopInvocations.workshopProblemId, workshopProblemId))
		.orderBy(desc(workshopInvocations.createdAt))
		.limit(limit);
}

export async function getInvocation(invocationId: number): Promise<WorkshopInvocation | null> {
	const [row] = await db
		.select()
		.from(workshopInvocations)
		.where(eq(workshopInvocations.id, invocationId))
		.limit(1);
	return row ?? null;
}

/**
 * Helper used by the dashboard overview card.
 */
export async function getLatestInvocation(
	workshopProblemId: number
): Promise<WorkshopInvocation | null> {
	const [row] = await db
		.select()
		.from(workshopInvocations)
		.where(eq(workshopInvocations.workshopProblemId, workshopProblemId))
		.orderBy(desc(workshopInvocations.createdAt))
		.limit(1);
	return row ?? null;
}
