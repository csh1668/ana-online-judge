import "server-only";

import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { db } from "@/db";
import { workshopTestcases } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { applyValidationResult } from "@/lib/services/workshop-validator";

const WORKSHOP_VALIDATE_RESULT_CHANNEL = "workshop:validate:results";

/**
 * Wire shape matches `WorkshopValidateResult` in
 * `judge/src/jobs/workshop/validate.rs`.
 */
type WorkshopValidateResult = {
	job_id: string;
	problem_id: number;
	testcase_id: number;
	valid: boolean;
	message: string | null;
	exit_code: number;
	compile_message: string | null;
};

type ValidationEvent = {
	jobId: string;
	problemId: number;
	testcaseId: number;
	valid: boolean;
	message: string | null;
	exitCode: number;
};

type SSESink = {
	controller: ReadableStreamDefaultController<Uint8Array>;
	encoder: TextEncoder;
};

const problemClients = new Map<number, Set<SSESink>>();

let subscriber: Redis | null = null;
let starting: Promise<void> | null = null;

export async function ensureValidateSubscriberStarted(): Promise<void> {
	if (subscriber) return;
	if (starting) return starting;
	starting = (async () => {
		const client = new Redis(serverEnv.REDIS_URL, {
			maxRetriesPerRequest: null,
			lazyConnect: true,
		});
		await client.connect();
		await client.subscribe(WORKSHOP_VALIDATE_RESULT_CHANNEL);
		client.on("message", async (channel, message) => {
			if (channel !== WORKSHOP_VALIDATE_RESULT_CHANNEL) return;
			try {
				const result = JSON.parse(message) as WorkshopValidateResult;
				await handleResult(result);
			} catch (err) {
				console.error("[workshop-validate-pubsub] failed to handle message:", err);
			}
		});
		client.on("error", (err) => {
			console.error("[workshop-validate-pubsub] subscriber error:", err);
		});
		subscriber = client;
	})();
	try {
		await starting;
	} finally {
		starting = null;
	}
}

async function handleResult(result: WorkshopValidateResult): Promise<void> {
	// Resolve draftId via the testcase row so we can validate scoping before
	// writing (defense in depth — a malicious or confused job payload cannot
	// flip statuses on an unrelated draft).
	const [row] = await db
		.select({ draftId: workshopTestcases.draftId })
		.from(workshopTestcases)
		.where(eq(workshopTestcases.id, result.testcase_id))
		.limit(1);
	if (!row) {
		console.warn(
			`[workshop-validate-pubsub] unknown testcase_id ${result.testcase_id} (job ${result.job_id})`
		);
		return;
	}
	await applyValidationResult({
		testcaseId: result.testcase_id,
		draftId: row.draftId,
		valid: result.valid,
	});

	const event: ValidationEvent = {
		jobId: result.job_id,
		problemId: result.problem_id,
		testcaseId: result.testcase_id,
		valid: result.valid,
		message: result.message,
		exitCode: result.exit_code,
	};
	fanoutToSSE(event);
}

function fanoutToSSE(event: ValidationEvent): void {
	const sinks = problemClients.get(event.problemId);
	if (!sinks || sinks.size === 0) return;
	const payload = `event: result\ndata: ${JSON.stringify(event)}\n\n`;
	for (const sink of sinks) {
		try {
			sink.controller.enqueue(sink.encoder.encode(payload));
		} catch (err) {
			console.warn("[workshop-validate-pubsub] sink enqueue failed:", err);
			sinks.delete(sink);
		}
	}
}

export function registerValidationSSEClient(problemId: number, sink: SSESink): () => void {
	let sinks = problemClients.get(problemId);
	if (!sinks) {
		sinks = new Set();
		problemClients.set(problemId, sinks);
	}
	sinks.add(sink);
	return () => {
		const current = problemClients.get(problemId);
		if (!current) return;
		current.delete(sink);
		if (current.size === 0) {
			problemClients.delete(problemId);
		}
	};
}

export function sendValidationHeartbeat(sink: SSESink): void {
	sink.controller.enqueue(sink.encoder.encode(": heartbeat\n\n"));
}
