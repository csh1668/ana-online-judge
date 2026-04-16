import "server-only";

import { eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { db } from "@/db";
import { workshopInvocations } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { notifyInvocationDone, notifyInvocationResult } from "./invocation-sse-manager";

/**
 * Shape of the messages received on `workshop:{problemId}:invocation:{invocationId}`
 * — must match `judge::jobs::workshop::invoke::WorkshopInvokeResult` in the Rust
 * judge (Phase 3 task 11).
 */
export type WorkshopInvokeResultPayload = {
	job_id: string;
	problem_id: number;
	invocation_id: string;
	solution_id: number;
	testcase_id: number;
	verdict: string;
	time_ms: number | null;
	memory_kb: number | null;
	stdout_preview: string | null;
	stderr: string | null;
	checker_message: string | null;
	compile_message: string | null;
};

/**
 * A single cell result as stored in `workshopInvocations.resultsJson` (array element).
 * Matches the spec S2 shape.
 */
export type InvocationResultCell = {
	solutionId: number;
	testcaseId: number;
	verdict: string;
	timeMs: number | null;
	memoryKb: number | null;
	stderr: string | null;
	checkerMessage: string | null;
	compileMessage: string | null;
	outputRef: string | null; // MinIO key for full stdout when uploaded; null otherwise
};

type ActiveSubscriber = {
	redis: Redis;
	expectedCellCount: number;
	receivedJobIds: Set<string>;
	startedAt: number;
	timeoutHandle: NodeJS.Timeout;
};

declare global {
	var workshopInvocationSubscribers: Map<string, ActiveSubscriber> | undefined;
}

if (!global.workshopInvocationSubscribers) {
	global.workshopInvocationSubscribers = new Map();
}

function getSubscribers(): Map<string, ActiveSubscriber> {
	if (!global.workshopInvocationSubscribers) {
		global.workshopInvocationSubscribers = new Map();
	}
	return global.workshopInvocationSubscribers;
}

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Start a listener for an invocation. Idempotent — if a subscriber is already
 * running for this invocationId it becomes a no-op.
 *
 * Caller is responsible for persisting an INITIAL `resultsJson = []` and
 * `status = 'running'` row BEFORE invoking this function (so an SSE subscriber
 * that connects immediately sees a consistent snapshot).
 */
export async function startInvocationSubscriber(params: {
	problemId: number;
	invocationId: string;
	expectedCellCount: number;
	invocationOutputKeys: Map<string, string>; // key = `${solutionId}_${testcaseId}`, value = MinIO key
}): Promise<void> {
	const { problemId, invocationId, expectedCellCount, invocationOutputKeys } = params;
	const map = getSubscribers();
	if (map.has(invocationId)) return;

	const channel = `workshop:${problemId}:invocation:${invocationId}`;
	const redis = new Redis(serverEnv.REDIS_URL, {
		maxRetriesPerRequest: null,
		lazyConnect: true,
	});
	await redis.connect();
	await redis.subscribe(channel);

	const active: ActiveSubscriber = {
		redis,
		expectedCellCount,
		receivedJobIds: new Set(),
		startedAt: Date.now(),
		timeoutHandle: setTimeout(() => {
			console.warn(`Invocation ${invocationId} subscriber timeout; marking failed`);
			void finalize(invocationId, "failed");
		}, TIMEOUT_MS),
	};
	map.set(invocationId, active);

	redis.on("message", async (ch, message) => {
		if (ch !== channel) return;
		try {
			const payload = JSON.parse(message) as WorkshopInvokeResultPayload;
			if (active.receivedJobIds.has(payload.job_id)) return; // defensive dedupe
			active.receivedJobIds.add(payload.job_id);

			const cellKey = `${payload.solution_id}_${payload.testcase_id}`;
			const cell: InvocationResultCell = {
				solutionId: payload.solution_id,
				testcaseId: payload.testcase_id,
				verdict: payload.verdict,
				timeMs: payload.time_ms,
				memoryKb: payload.memory_kb,
				stderr: payload.stderr,
				checkerMessage: payload.checker_message,
				compileMessage: payload.compile_message,
				outputRef: invocationOutputKeys.get(cellKey) ?? null,
			};

			// Append to resultsJson using jsonb || operator (atomic)
			await db
				.update(workshopInvocations)
				.set({
					resultsJson: sql`${workshopInvocations.resultsJson} || ${JSON.stringify([cell])}::jsonb`,
				})
				.where(eq(workshopInvocations.id, invocationId));

			notifyInvocationResult(invocationId, cell);

			if (active.receivedJobIds.size >= active.expectedCellCount) {
				await finalize(invocationId, "completed");
			}
		} catch (err) {
			console.error(`Error handling invocation message for ${invocationId}:`, err);
		}
	});

	redis.on("error", (err) => {
		console.error(`Invocation subscriber redis error for ${invocationId}:`, err);
	});
}

async function finalize(invocationId: string, status: "completed" | "failed"): Promise<void> {
	const map = getSubscribers();
	const active = map.get(invocationId);
	if (!active) return;
	map.delete(invocationId);
	clearTimeout(active.timeoutHandle);

	try {
		await active.redis.unsubscribe();
		await active.redis.quit();
	} catch (err) {
		console.error(`Error closing invocation subscriber for ${invocationId}:`, err);
	}

	try {
		await db
			.update(workshopInvocations)
			.set({ status, completedAt: new Date() })
			.where(eq(workshopInvocations.id, invocationId));
	} catch (err) {
		console.error(`Error finalizing invocation ${invocationId}:`, err);
	}

	await notifyInvocationDone(invocationId, status);
}

/**
 * Called by SSE endpoint on restart/reconnect to ensure a subscriber is live
 * for an in-flight invocation even after a dev-server HMR. If the invocation
 * is already `completed`/`failed`, this is a no-op (caller should read
 * resultsJson directly).
 */
export function isSubscriberActive(invocationId: string): boolean {
	return getSubscribers().has(invocationId);
}
