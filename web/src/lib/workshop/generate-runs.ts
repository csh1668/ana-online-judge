/**
 * In-memory registry of active script runs. Lives for the lifetime of the
 * Node process. A run is a collection of generate-jobs spawned by a single
 * `runScript()` call. SSE clients subscribe to a `runId` and receive
 * per-job results as they arrive.
 *
 * Multi-replica scaling: replace this with a Redis-backed state keyed by
 * `workshop:run:{runId}` (hash: job_id → json). See Phase 6's invocation
 * plan for the same concern.
 */

import { randomUUID } from "node:crypto";

export type GenerateJobProgress = {
	job_id: string;
	testcase_index: number;
	status: "pending" | "done" | "failed";
	message?: string;
	timeMs?: number;
	memoryKb?: number;
};

export type GenerateRun = {
	runId: string;
	problemId: number;
	userId: number;
	draftId: number;
	jobIds: Set<string>;
	/** Indexed by job_id. */
	progress: Map<string, GenerateJobProgress>;
	/** job_id → the workshop_testcases row id it targets. */
	jobIdToRowId: Map<string, number>;
	/** Generated lines — the ones we wait for. */
	generatedCount: number;
	createdAt: number;
	/** Set to true once all generated jobs have produced a result. */
	done: boolean;
	/** Subscribers that want push updates. */
	listeners: Set<(evt: GenerateJobProgress) => void>;
};

const runs = new Map<string, GenerateRun>();

const RUN_TTL_MS = 30 * 60 * 1000; // 30m safety GC

function gc(): void {
	const now = Date.now();
	for (const [id, run] of runs) {
		if (now - run.createdAt > RUN_TTL_MS) runs.delete(id);
	}
}

export function createRun(params: {
	problemId: number;
	userId: number;
	draftId: number;
	jobIds: string[];
	pendingProgress: GenerateJobProgress[];
	jobIdToRowId: Map<string, number>;
}): GenerateRun {
	gc();
	const runId = randomUUID();
	const progress = new Map<string, GenerateJobProgress>();
	for (const p of params.pendingProgress) progress.set(p.job_id, p);
	const run: GenerateRun = {
		runId,
		problemId: params.problemId,
		userId: params.userId,
		draftId: params.draftId,
		jobIds: new Set(params.jobIds),
		progress,
		jobIdToRowId: params.jobIdToRowId,
		generatedCount: params.jobIds.length,
		createdAt: Date.now(),
		done: params.jobIds.length === 0,
		listeners: new Set(),
	};
	runs.set(runId, run);
	return run;
}

export function getRun(runId: string): GenerateRun | undefined {
	return runs.get(runId);
}

/**
 * Return true if `userId` has any non-`done` run still registered.
 * Used by `runScript` to enforce one-at-a-time per user.
 */
export function hasActiveRunForUser(userId: number): boolean {
	gc();
	for (const run of runs.values()) {
		if (run.userId === userId && !run.done) return true;
	}
	return false;
}

/** True if `draftId` has any non-`done` run still registered. */
export function hasActiveRunForDraft(draftId: number): boolean {
	gc();
	for (const run of runs.values()) {
		if (run.draftId === draftId && !run.done) return true;
	}
	return false;
}

export function recordRunProgress(runId: string, evt: GenerateJobProgress): void {
	const run = runs.get(runId);
	if (!run) return;
	run.progress.set(evt.job_id, evt);
	if (evt.status !== "pending") {
		const remaining = [...run.progress.values()].filter((p) => p.status === "pending");
		if (remaining.length === 0) run.done = true;
	}
	for (const l of run.listeners) l(evt);
}

export function subscribeRun(runId: string, fn: (evt: GenerateJobProgress) => void): () => void {
	const run = runs.get(runId);
	if (!run) return () => {};
	run.listeners.add(fn);
	return () => {
		run.listeners.delete(fn);
	};
}
