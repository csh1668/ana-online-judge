import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopInvocation,
	workshopDrafts,
	workshopInvocations,
	workshopProblems,
	workshopResources,
	workshopSolutions,
	workshopTestcases,
} from "@/db/schema";
import { SYSTEM_JOB_PRIORITY } from "@/lib/judge-priority";
import {
	pushWorkshopInvokeJob,
	type WorkshopInvokeChecker,
	type WorkshopInvokeResource,
} from "@/lib/judge-queue";
import { copyObject, downloadFile } from "@/lib/storage/operations";
import { startInvocationSubscriber } from "@/lib/workshop/invocation-subscriber";
import { draftOpLockKey, isWorkshopLockHeld } from "@/lib/workshop/op-lock";
import { workshopDraftTestcaseFilePath, workshopInvocationOutputPath } from "@/lib/workshop/paths";

/**
 * Shape of `selectedSolutionsJson` -- snapshot of selected solutions at
 * invocation creation time (spec S2). Rendered as matrix rows in UI.
 */
export type InvocationSolutionSnapshot = {
	id: number;
	name: string;
	language: string;
	expectedVerdict: string;
	/** sha256 of the solution source at invocation time. Absent on legacy rows. */
	sourceHash?: string;
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
		| "no_testcases_selected"
		| "matrix_too_large"
		| "concurrent_invocation_running";
	message: string;
	missingTestcaseIds?: number[];
};

const MAX_INVOCATION_MATRIX_SIZE = 1000;

const USER_INVOCATION_LOCK_CLASS = 42003;

/**
 * Insert a new `workshopInvocations` row while holding a per-user Postgres
 * advisory lock, so the "no other invocation is running" check and the
 * insert happen atomically -- closing the race where two concurrent requests
 * both pass the running-check and both insert. Workshop invocations enqueue
 * up to NxM judge jobs, so one-at-a-time prevents a single user from
 * saturating the judge queue.
 */
async function insertInvocationExclusively(
	values: typeof workshopInvocations.$inferInsert
): Promise<WorkshopInvocation> {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(${USER_INVOCATION_LOCK_CLASS}, ${values.createdBy})`
		);
		const [running] = await tx
			.select({ id: workshopInvocations.id })
			.from(workshopInvocations)
			.where(
				and(
					eq(workshopInvocations.createdBy, values.createdBy),
					eq(workshopInvocations.status, "running")
				)
			)
			.limit(1);
		if (running) {
			throw new InvocationPreconditionError({
				reason: "concurrent_invocation_running",
				message: "이미 진행 중인 인보케이션이 있습니다. 완료된 후 다시 시도하세요",
			});
		}
		const [row] = await tx.insert(workshopInvocations).values(values).returning();
		return row;
	});
}

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
	const matrixSize = selectedSolutionIds.length * selectedTestcaseIds.length;
	if (matrixSize > MAX_INVOCATION_MATRIX_SIZE) {
		return {
			reason: "matrix_too_large",
			message: `한 번에 실행할 수 있는 (솔루션 × 테스트케이스)는 최대 ${MAX_INVOCATION_MATRIX_SIZE}개입니다 (현재 ${matrixSize}개)`,
		};
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
 * Minimal problem context consumed by invocation building: identity (`id`) from
 * the shared `workshopProblems` row, and the limit/checker header fields sourced
 * from the per-user `workshopDrafts` row.
 */
type InvokeProblemContext = {
	id: number;
	checkerLanguage: string | null;
	checkerPath: string | null;
	timeLimit: number;
	memoryLimit: number;
};

/**
 * Load the context needed to build `workshop_invoke` payloads: problem identity,
 * resource list, and the checker/limit header fields (from the draft).
 */
async function loadProblemContext(
	problemId: number,
	draftId: number
): Promise<{
	problem: InvokeProblemContext;
	resources: WorkshopInvokeResource[];
}> {
	const [base] = await db
		.select({ id: workshopProblems.id })
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	if (!base) throw new Error("문제를 찾을 수 없습니다");
	const [draft] = await db
		.select()
		.from(workshopDrafts)
		.where(eq(workshopDrafts.id, draftId))
		.limit(1);
	if (!draft) throw new Error("드래프트를 찾을 수 없습니다");

	// 정체성은 problem에서, 헤더(체커/제한)는 draft에서 가져온다.
	const problem: InvokeProblemContext = {
		id: base.id,
		checkerLanguage: draft.checkerLanguage,
		checkerPath: draft.checkerPath,
		timeLimit: draft.timeLimit,
		memoryLimit: draft.memoryLimit,
	};

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
function buildCheckerPayload(problem: InvokeProblemContext): WorkshopInvokeChecker | null {
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

	// Fast-fail while a rollback/update holds the draft op-lock (Task 12). This
	// is a plain check-then-act, and everything below it — precondition reads,
	// then per-solution/per-testcase sha256 hashing over MinIO downloads — can
	// run for seconds before the row insert, so a rollback can still acquire
	// the lock and start wiping mid-flight here; the window is NOT tiny.
	// Accepted anyway: rollback's own active-job check — the draft-scoped
	// `running`-invocation query inline in `rollbackToSnapshot`
	// (workshop-snapshots.ts) — blocks the reverse direction, so a rollback
	// that wins the lock first will see nothing runs concurrently. And a
	// stale invocation that slips through this window never writes onto
	// draft paths at all — every judge result lands at an invocation-scoped
	// output key (`workshopInvocationOutputPath`), so it can't corrupt a
	// draft file the rollback is wiping/restoring.
	if (await isWorkshopLockHeld(draftOpLockKey(draftId))) {
		throw new Error("드래프트 롤백/업데이트가 진행 중입니다. 잠시 후 다시 시도하세요.");
	}

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

	const solutionSnapshot: InvocationSolutionSnapshot[] = await Promise.all(
		solutions.map(async (s) => ({
			id: s.id,
			name: s.name,
			language: s.language,
			expectedVerdict: s.expectedVerdict,
			sourceHash: await sha256OfKey(s.sourcePath),
		}))
	);
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

	// Persist the running row FIRST (serial id assigned by Postgres), guarded
	// by the per-user advisory lock so concurrent requests can't both insert.
	const invocation = await insertInvocationExclusively({
		workshopProblemId: problemId,
		status: "running",
		draftId,
		kind: "invoke",
		selectedSolutionsJson: solutionSnapshot,
		selectedTestcasesJson: testcaseSnapshot,
		resultsJson: [],
		createdBy: userId,
	});

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

			await pushWorkshopInvokeJob(
				{
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
				},
				SYSTEM_JOB_PRIORITY
			);
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
 * WITHOUT a checker. Judge output lands at an invocation-scoped MinIO key
 * (never a draft path directly) -- on AC, the subscriber re-reads the
 * testcase row and copies the invocation output onto the draft's output
 * path, so a rollback/replace of the testcase between enqueue and judge
 * completion can't corrupt another testcase's output.
 *
 * Precondition (hard):
 * - isMain=true solution exists
 * - at least one testcase exists
 *
 * Does NOT require that testcases already have outputs -- this is how you
 * fill them.
 */
export async function generateAnswers(params: {
	problemId: number;
	userId: number;
	draftId: number;
}): Promise<CreateInvocationResult> {
	const { problemId, userId, draftId } = params;

	// Fast-fail while a rollback/update holds the draft op-lock (Task 12). This
	// is a plain check-then-act, and everything below it — the main-solution
	// and testcase loads, then per-testcase sha256 hashing over MinIO
	// downloads for the snapshot — can run for seconds before the row insert,
	// so a rollback can still acquire the lock and start wiping mid-flight
	// here; the window is NOT tiny. Accepted anyway: rollback's own
	// active-job check — the draft-scoped `running`-invocation query inline
	// in `rollbackToSnapshot` (workshop-snapshots.ts) — blocks the reverse
	// direction, so a rollback that wins the lock first will see nothing
	// runs concurrently. And a stale run that slips through this window only
	// ever writes judge output to an invocation-scoped key first; the
	// subscriber's `onCellResult` re-reads the target testcase row by id
	// right before copying onto the draft's output path, so if rollback
	// replaced/deleted that row in the meantime (new rows get new ids), the
	// match fails and the stale result is dropped instead of landing on a
	// wiped/restored draft file.
	if (await isWorkshopLockHeld(draftOpLockKey(draftId))) {
		throw new Error("드래프트 롤백/업데이트가 진행 중입니다. 잠시 후 다시 시도하세요.");
	}

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
	if (testcases.length > MAX_INVOCATION_MATRIX_SIZE) {
		throw new InvocationPreconditionError({
			reason: "matrix_too_large",
			message: `한 번에 정답 생성 가능한 테스트케이스는 최대 ${MAX_INVOCATION_MATRIX_SIZE}개입니다 (현재 ${testcases.length}개)`,
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
			sourceHash: await sha256OfKey(main.sourcePath),
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

	const invocation = await insertInvocationExclusively({
		workshopProblemId: problemId,
		status: "running",
		draftId,
		kind: "generate",
		selectedSolutionsJson: solutionSnapshot,
		selectedTestcasesJson: testcaseSnapshot,
		resultsJson: [],
		createdBy: userId,
	});

	const invocationId = invocation.id;
	const invocationOutputKeys = new Map<string, string>();

	for (const testcase of testcases) {
		const uploadPath = workshopInvocationOutputPath(problemId, invocationId, main.id, testcase.id);
		const jobId = `${invocationId}:${main.id}:${testcase.id}`;

		invocationOutputKeys.set(`${main.id}_${testcase.id}`, uploadPath);

		await pushWorkshopInvokeJob(
			{
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
				stdoutUploadPath: uploadPath,
			},
			SYSTEM_JOB_PRIORITY
		);
	}

	await startInvocationSubscriber({
		problemId,
		invocationId,
		expectedCellCount: testcases.length,
		invocationOutputKeys,
		onCellResult: async (cell) => {
			if (cell.verdict !== "accepted") return;
			// Re-read the row at promotion time: if it was deleted or replaced by a
			// rollback since enqueue (new rows get new ids), this matches nothing and
			// the stale output is dropped instead of corrupting another testcase.
			const [row] = await db
				.select()
				.from(workshopTestcases)
				.where(
					and(eq(workshopTestcases.id, cell.testcaseId), eq(workshopTestcases.draftId, draftId))
				)
				.limit(1);
			if (!row) return;
			const srcKey = invocationOutputKeys.get(`${main.id}_${cell.testcaseId}`);
			if (!srcKey) return;
			const destKey =
				row.outputPath ?? workshopDraftTestcaseFilePath(problemId, userId, row.id, "output");
			await copyObject(srcKey, destKey);
			await db
				.update(workshopTestcases)
				.set({ outputPath: destKey })
				.where(eq(workshopTestcases.id, row.id));
		},
	});

	return { invocationId };
}

export async function listInvocations(
	workshopProblemId: number,
	draftId: number,
	limit = 20
): Promise<WorkshopInvocation[]> {
	return db
		.select()
		.from(workshopInvocations)
		.where(
			and(
				eq(workshopInvocations.workshopProblemId, workshopProblemId),
				eq(workshopInvocations.draftId, draftId)
			)
		)
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
	workshopProblemId: number,
	draftId: number
): Promise<WorkshopInvocation | null> {
	const [row] = await db
		.select()
		.from(workshopInvocations)
		.where(
			and(
				eq(workshopInvocations.workshopProblemId, workshopProblemId),
				eq(workshopInvocations.draftId, draftId)
			)
		)
		.orderBy(desc(workshopInvocations.createdAt))
		.limit(1);
	return row ?? null;
}
