import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopProblem, workshopTestcases } from "@/db/schema";
import { getRedisClient } from "@/lib/redis";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import {
	createRun,
	type GenerateJobProgress,
	type GenerateRun,
	recordRunProgress,
} from "@/lib/workshop/generate-runs";
import { workshopDraftManualInboxPath, workshopDraftTestcasePath } from "@/lib/workshop/paths";
import {
	collectReferencedGenerators,
	type ParsedStep,
	parseGeneratorScript,
} from "@/lib/workshop/script-parser";
import { indexByName, listGeneratorsForDraft } from "./workshop-generators";
import { listInbox } from "./workshop-manual-inbox";

const GENERATE_TIME_LIMIT_MS = 30_000;
const GENERATE_MEMORY_LIMIT_MB = 1024;

type ResourceForJudge = { name: string; storage_path: string };

export type ScriptRunOutcome = {
	runId: string;
	generatedCount: number;
	manualCount: number;
};

/**
 * Parse the script text, validate, wipe existing testcases, enqueue
 * workshop_generate jobs for generated lines, and (synchronously) copy inbox
 * files for manual lines. Returns a runId the caller surfaces to the client
 * via SSE.
 *
 * Partial-failure handling: inbox-consumption errors throw immediately AFTER
 * the wipe — the caller surfaces a friendly error, and the user re-uploads.
 * Enqueue-side errors (rare) are caught and recorded in the run's progress
 * as status=failed so the SSE endpoint reports them.
 */
export async function runScript(params: {
	problem: WorkshopProblem;
	userId: number;
	draftId: number;
	script: string;
}): Promise<ScriptRunOutcome> {
	const { problem, userId, draftId } = params;

	// 1) Load generators + inbox listing — needed for validation.
	const [generatorRows, inbox] = await Promise.all([
		listGeneratorsForDraft(draftId),
		listInbox(problem.id, userId),
	]);
	const generatorsByName = indexByName(generatorRows);

	// 2) Parse & validate. Throws WorkshopScriptParseError on user error.
	const steps = parseGeneratorScript(params.script, new Set(generatorRows.map((g) => g.name)));

	// Distinguish manual vs generated up-front, and pre-validate inbox
	// sufficiency so we fail BEFORE destroying anything.
	const manualSteps = steps.filter(
		(s): s is Extract<ParsedStep, { kind: "manual" }> => s.kind === "manual"
	);
	if (manualSteps.length > inbox.length) {
		throw new Error(
			`수동 인박스에 파일이 ${inbox.length}개 있는데, 스크립트는 ${manualSteps.length}개를 요구합니다. 인박스에 파일을 먼저 업로드하세요.`
		);
	}
	// Also sanity-check every referenced generator exists (the parser already
	// did this when knownGeneratorNames was provided, so this is a belt-and-
	// suspenders check).
	for (const name of collectReferencedGenerators(steps)) {
		if (!generatorsByName.has(name)) {
			throw new Error(`알 수 없는 제너레이터: ${name}`);
		}
	}

	// 3) WIPE — load existing testcases so we can delete their MinIO files.
	const existing = await db
		.select()
		.from(workshopTestcases)
		.where(eq(workshopTestcases.draftId, draftId))
		.orderBy(asc(workshopTestcases.index));

	for (const tc of existing) {
		try {
			await deleteFile(tc.inputPath);
		} catch {
			/* best-effort */
		}
		if (tc.outputPath) {
			try {
				await deleteFile(tc.outputPath);
			} catch {
				/* best-effort */
			}
		}
	}
	await db.delete(workshopTestcases).where(eq(workshopTestcases.draftId, draftId));

	// 4) Build resource bundle for the judge — all workshop resources for the draft.
	const resources = await loadResourcesForJudge(draftId);

	// 5) Walk steps, creating rows + enqueueing jobs in order.
	const redis = await getRedisClient();
	const jobIds: string[] = [];
	const pendingProgress: GenerateJobProgress[] = [];

	let inboxCursor = 0;
	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		const index = i + 1;
		const inputPath = workshopDraftTestcasePath(problem.id, userId, index, "input");

		if (step.kind === "manual") {
			// Consume next inbox file (FIFO).
			const entry = inbox[inboxCursor];
			inboxCursor++;
			const src = workshopDraftManualInboxPath(problem.id, userId, entry.name);
			const bytes = await downloadFile(src);
			await uploadFile(inputPath, bytes, "text/plain");

			await db.insert(workshopTestcases).values({
				draftId,
				index,
				source: "manual",
				inputPath,
				outputPath: null,
				subtaskGroup: 0,
				score: 0,
				validationStatus: "pending",
			});
		} else {
			// Generated — enqueue workshop_generate.
			const gen = generatorsByName.get(step.generatorName);
			if (!gen) {
				// Should never happen because of the pre-validate above.
				throw new Error(`제너레이터 조회 실패: ${step.generatorName}`);
			}

			const [row] = await db
				.insert(workshopTestcases)
				.values({
					draftId,
					index,
					source: "generated",
					generatorId: gen.id,
					generatorArgs: step.args.join(" "),
					inputPath,
					outputPath: null,
					subtaskGroup: 0,
					score: 0,
					validationStatus: "pending",
				})
				.returning();

			const jobId = randomUUID();
			jobIds.push(jobId);
			pendingProgress.push({
				job_id: jobId,
				testcase_index: index,
				status: "pending",
			});

			const payload = {
				job_type: "workshop_generate",
				job_id: jobId,
				problem_id: problem.id,
				user_id: userId,
				testcase_index: index,
				language: gen.language,
				source_path: gen.sourcePath,
				args: step.args,
				seed: problem.seed,
				resources,
				output_path: inputPath,
				time_limit_ms: GENERATE_TIME_LIMIT_MS,
				memory_limit_mb: GENERATE_MEMORY_LIMIT_MB,
			};
			await redis.rpush("judge:queue", JSON.stringify(payload));

			// Fire-and-forget stash so the SSE endpoint can correlate testcase_index → row.
			void row;
		}
	}

	// 6) Create the run registry entry + start Redis subscription.
	const run = createRun({
		problemId: problem.id,
		userId,
		jobIds,
		manualCount: steps.length - jobIds.length,
		pendingProgress,
	});
	attachRedisSubscriber(run).catch((err) => {
		console.error("[workshop-script-runner] subscriber attach failed:", err);
	});

	return {
		runId: run.runId,
		generatedCount: jobIds.length,
		manualCount: steps.length - jobIds.length,
	};
}

/**
 * Subscribe to the per-problem generate channel and feed completion events
 * into the generate-runs registry. The subscription ends as soon as every
 * job_id in the run has reported a terminal status, or after a generous
 * wallclock timeout (6 minutes — 2 × 30s × 12 jobs budget).
 */
async function attachRedisSubscriber(run: GenerateRun): Promise<void> {
	if (run.jobIds.size === 0) return;
	const redis = await getRedisClient();
	const sub = redis.duplicate();
	const channel = `workshop:${run.problemId}:generate`;
	await sub.subscribe(channel);

	const timeoutMs = Math.max(60_000, run.jobIds.size * 30_000 * 2);
	const timeout = setTimeout(async () => {
		for (const [jobId, p] of run.progress) {
			if (p.status === "pending") {
				recordRunProgress(run.runId, {
					job_id: jobId,
					testcase_index: p.testcase_index,
					status: "failed",
					message: "timed out waiting for judge",
				});
			}
		}
		try {
			await sub.unsubscribe(channel);
			await sub.quit();
		} catch {
			/* ignore */
		}
	}, timeoutMs);

	sub.on("message", (_channel, message) => {
		let data: {
			job_id?: string;
			testcase_index?: number;
			success?: boolean;
			stderr?: string;
			compile_message?: string | null;
			time_ms?: number;
			memory_kb?: number;
		};
		try {
			data = JSON.parse(message);
		} catch {
			return;
		}
		if (!data.job_id || !run.jobIds.has(data.job_id)) return;

		const msg = !data.success
			? data.compile_message || data.stderr || "execution failed"
			: undefined;

		recordRunProgress(run.runId, {
			job_id: data.job_id,
			testcase_index: data.testcase_index ?? 0,
			status: data.success ? "done" : "failed",
			message: msg,
			timeMs: data.time_ms,
			memoryKb: data.memory_kb,
		});

		// If everything is settled, tear down.
		const anyPending = [...run.progress.values()].some((p) => p.status === "pending");
		if (!anyPending) {
			clearTimeout(timeout);
			sub.unsubscribe(channel).catch(() => {});
			sub.quit().catch(() => {});
		}
	});
}

async function loadResourcesForJudge(draftId: number): Promise<ResourceForJudge[]> {
	const { workshopResources } = await import("@/db/schema");
	const rows = await db
		.select({ name: workshopResources.name, path: workshopResources.path })
		.from(workshopResources)
		.where(eq(workshopResources.draftId, draftId));
	return rows.map((r) => ({ name: r.name, storage_path: r.path }));
}

export async function getScript(problemId: number): Promise<string> {
	const { workshopProblems } = await import("@/db/schema");
	const [row] = await db
		.select({ s: workshopProblems.generatorScript })
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	return row?.s ?? "";
}

export async function saveScript(problemId: number, script: string): Promise<void> {
	const { workshopProblems } = await import("@/db/schema");
	await db
		.update(workshopProblems)
		.set({ generatorScript: script, updatedAt: new Date() })
		.where(eq(workshopProblems.id, problemId));
}
