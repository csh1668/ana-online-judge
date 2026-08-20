import { randomUUID } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopProblem, workshopTestcases } from "@/db/schema";
import { getRedisClient } from "@/lib/redis";
import { deleteFile } from "@/lib/storage/operations";
import { getDraftById } from "@/lib/workshop/draft-header";
import {
	createRun,
	type GenerateJobProgress,
	type GenerateRun,
	hasActiveRunForUser,
	recordRunProgress,
} from "@/lib/workshop/generate-runs";
import { workshopDraftTestcaseFilePath } from "@/lib/workshop/paths";
import { collectReferencedGenerators, parseGeneratorScript } from "@/lib/workshop/script-parser";
import { indexByName, listGeneratorsForDraft } from "./workshop-generators";

const MAX_TESTCASES_PER_DRAFT = 200;
const GENERATE_TIME_LIMIT_MS = 30_000;
const GENERATE_MEMORY_LIMIT_MB = 1024;

type ResourceForJudge = { name: string; storage_path: string };

export type ScriptRunOutcome = {
	runId: string;
	generatedCount: number;
};

/**
 * Parse the script text, validate, wipe existing generated testcases, and
 * enqueue `workshop_generate` jobs. Returns a runId the caller surfaces to
 * the client via SSE.
 *
 * Known limitation (I6 — wipe-then-enqueue non-atomicity, deferred):
 *   The current flow wipes existing testcase rows + MinIO files BEFORE
 *   enqueueing new jobs. If the process crashes between the wipe and a
 *   successful enqueue (or if downstream judge jobs all fail), the user is
 *   left with an empty draft and no way to recover the previous testcases.
 *   A future fix would tag pending writes with a batch ID, materialize them
 *   to side paths, then perform an atomic swap on completion. Tracked as a
 *   follow-up; for now users should snapshot before destructive script runs.
 */
export async function runScript(params: {
	problem: WorkshopProblem;
	userId: number;
	draftId: number;
	script: string;
}): Promise<ScriptRunOutcome> {
	const { problem, userId, draftId } = params;

	if (hasActiveRunForUser(userId)) {
		throw new Error("이미 진행 중인 스크립트 실행이 있습니다. 완료된 후 다시 시도하세요");
	}

	// 1) Load generators — needed for validation. The seed lives on the
	//    per-user draft (Phase A) and is passed to each generate job.
	const generatorRows = await listGeneratorsForDraft(draftId);
	const generatorsByName = indexByName(generatorRows);
	const draft = await getDraftById(draftId);
	if (!draft) throw new Error("드래프트를 찾을 수 없습니다");
	const seed = draft.seed;

	// 2) Parse & validate. Throws WorkshopScriptParseError on user error.
	const steps = parseGeneratorScript(params.script, new Set(generatorRows.map((g) => g.name)));

	// Sanity-check every referenced generator exists (the parser already did
	// this when knownGeneratorNames was provided, so this is a belt-and-
	// suspenders check).
	for (const name of collectReferencedGenerators(steps)) {
		if (!generatorsByName.has(name)) {
			throw new Error(`알 수 없는 제너레이터: ${name}`);
		}
	}

	// Pre-wipe cap check: existing manual testcases survive, generated rows
	// are replaced by `steps.length` new rows. Refuse before destroying state
	// if the post-run count would exceed the per-draft cap.
	const [{ value: existingManualCount }] = await db
		.select({ value: count() })
		.from(workshopTestcases)
		.where(and(eq(workshopTestcases.draftId, draftId), eq(workshopTestcases.source, "manual")));
	const totalAfter = existingManualCount + steps.length;
	if (totalAfter > MAX_TESTCASES_PER_DRAFT) {
		throw new Error(
			`스크립트 실행 후 테스트케이스가 ${totalAfter}개가 되어 draft당 한도(${MAX_TESTCASES_PER_DRAFT}개)를 초과합니다`
		);
	}

	// 3) WIPE — only `source='generated'` rows. Manual testcases (added via UI
	//    or previous script runs' `manual` lines) are PRESERVED so users don't
	//    lose hand-curated tests when re-running the script. Newly generated
	//    rows below are appended after the highest existing index.
	const existingGenerated = await db
		.select()
		.from(workshopTestcases)
		.where(and(eq(workshopTestcases.draftId, draftId), eq(workshopTestcases.source, "generated")))
		.orderBy(asc(workshopTestcases.index));

	for (const tc of existingGenerated) {
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
	await db
		.delete(workshopTestcases)
		.where(and(eq(workshopTestcases.draftId, draftId), eq(workshopTestcases.source, "generated")));

	// Determine the starting index for new rows: max(existing surviving index) + 1.
	const surviving = await db
		.select({ index: workshopTestcases.index })
		.from(workshopTestcases)
		.where(eq(workshopTestcases.draftId, draftId));
	const baseIndex = surviving.length === 0 ? 0 : Math.max(...surviving.map((r) => r.index));

	// 4) Build resource bundle for the judge — all workshop resources for the draft.
	const resources = await loadResourcesForJudge(draftId);

	// 5) Walk steps, creating rows + enqueueing jobs in order.
	const redis = await getRedisClient();
	const jobIds: string[] = [];
	const pendingProgress: GenerateJobProgress[] = [];

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		const index = baseIndex + i + 1;

		const gen = generatorsByName.get(step.generatorName);
		if (!gen) {
			// Should never happen because of the pre-validate above.
			throw new Error(`제너레이터 조회 실패: ${step.generatorName}`);
		}

		const [inserted] = await db
			.insert(workshopTestcases)
			.values({
				draftId,
				index,
				source: "generated",
				generatorId: gen.id,
				generatorArgs: step.args.join(" "),
				inputPath: "",
				outputPath: null,
				subtaskGroup: 0,
				score: 0,
				validationStatus: "pending",
			})
			.returning();
		const inputPath = workshopDraftTestcaseFilePath(problem.id, userId, inserted.id, "input");
		const [row] = await db
			.update(workshopTestcases)
			.set({ inputPath })
			.where(eq(workshopTestcases.id, inserted.id))
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
			seed,
			resources,
			output_path: inputPath,
			time_limit_ms: GENERATE_TIME_LIMIT_MS,
			memory_limit_mb: GENERATE_MEMORY_LIMIT_MB,
		};
		await redis.rpush("judge:queue", JSON.stringify(payload));

		// Fire-and-forget stash so the SSE endpoint can correlate testcase_index → row.
		void row;
	}

	// 6) Create the run registry entry + start Redis subscription.
	const run = createRun({
		problemId: problem.id,
		userId,
		draftId,
		jobIds,
		pendingProgress,
	});
	attachRedisSubscriber(run).catch((err) => {
		console.error("[workshop-script-runner] subscriber attach failed:", err);
	});

	return {
		runId: run.runId,
		generatedCount: jobIds.length,
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

		// On failure, clean up the placeholder testcase row + best-effort delete
		// the (likely non-existent) MinIO input file. The SSE message above
		// already carries the failure info (which line failed + stderr), so the
		// user sees the error before the row disappears from the table.
		if (!data.success && typeof data.testcase_index === "number") {
			const failedIndex = data.testcase_index;
			void cleanupFailedTestcase({
				draftId: run.draftId,
				problemId: run.problemId,
				userId: run.userId,
				index: failedIndex,
			}).catch((err) => {
				console.error("[workshop-script-runner] failed-testcase cleanup error:", err);
			});
		}

		// If everything is settled, tear down.
		const anyPending = [...run.progress.values()].some((p) => p.status === "pending");
		if (!anyPending) {
			clearTimeout(timeout);
			sub.unsubscribe(channel).catch(() => {});
			sub.quit().catch(() => {});
		}
	});
}

/**
 * Best-effort cleanup for a failed generate job:
 *   - DELETE the placeholder workshop_testcases row (created upfront in
 *     runScript), so the testcases table doesn't accumulate broken rows
 *     pointing at non-existent MinIO objects.
 *   - DELETE the MinIO input file at the row's `inputPath` (almost always
 *     absent on failure, but in rare cases — partial write — it may exist).
 *
 * The row is looked up before deletion so we can read its (id-keyed)
 * `inputPath` column value — the path can no longer be re-derived from
 * `index` alone. If the row is already gone, there's nothing to clean up.
 *
 * Both deletes swallow errors: the SSE channel already surfaced the failure
 * to the user, and a stale row is strictly better than throwing here and
 * leaving the subscriber in an inconsistent state.
 */
async function cleanupFailedTestcase(params: {
	draftId: number;
	problemId: number;
	userId: number;
	index: number;
}): Promise<void> {
	const { draftId, index } = params;
	const [row] = await db
		.select({ id: workshopTestcases.id, inputPath: workshopTestcases.inputPath })
		.from(workshopTestcases)
		.where(and(eq(workshopTestcases.draftId, draftId), eq(workshopTestcases.index, index)));
	if (!row) return;
	try {
		await db.delete(workshopTestcases).where(eq(workshopTestcases.id, row.id));
	} catch (err) {
		console.error("[workshop-script-runner] failed to delete testcase row:", err);
	}
	try {
		await deleteFile(row.inputPath);
	} catch {
		/* best-effort — file usually doesn't exist on generator failure */
	}
}

async function loadResourcesForJudge(draftId: number): Promise<ResourceForJudge[]> {
	const { workshopResources } = await import("@/db/schema");
	const rows = await db
		.select({ name: workshopResources.name, path: workshopResources.path })
		.from(workshopResources)
		.where(eq(workshopResources.draftId, draftId));
	return rows.map((r) => ({ name: r.name, storage_path: r.path }));
}

export async function getScript(problemId: number, userId: number): Promise<string> {
	const { workshopDrafts } = await import("@/db/schema");
	const [row] = await db
		.select({ s: workshopDrafts.generatorScript })
		.from(workshopDrafts)
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)))
		.limit(1);
	return row?.s ?? "";
}

export async function saveScript(problemId: number, userId: number, script: string): Promise<void> {
	const { workshopDrafts } = await import("@/db/schema");
	await db
		.update(workshopDrafts)
		.set({ generatorScript: script, updatedAt: new Date() })
		.where(and(eq(workshopDrafts.workshopProblemId, problemId), eq(workshopDrafts.userId, userId)));
}
