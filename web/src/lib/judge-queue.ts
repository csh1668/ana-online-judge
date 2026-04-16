import { eq } from "drizzle-orm";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { getRedisClient } from "@/lib/redis";

export async function pushStandardJudgeJob(job: {
	submissionId: number;
	problemId: number;
	code: string;
	language: string;
	timeLimit: number;
	memoryLimit: number;
	maxScore: number;
	testcases: { id: number; inputPath: string; outputPath: string }[];
	problemType: string;
	checkerPath: string | null;
}) {
	const redis = await getRedisClient();

	const jobData = JSON.stringify({
		job_type: "judge",
		submission_id: job.submissionId,
		problem_id: job.problemId,
		code: job.code,
		language: job.language,
		time_limit: job.timeLimit,
		ignore_time_limit_bonus: false,
		memory_limit: job.memoryLimit,
		ignore_memory_limit_bonus: false,
		max_score: job.maxScore,
		testcases: job.testcases.map((tc) => ({
			id: tc.id,
			input_path: tc.inputPath,
			output_path: tc.outputPath,
		})),
		problem_type: job.problemType === "interactive" ? "special_judge" : job.problemType,
		checker_path: job.checkerPath,
	});

	await redis.rpush("judge:queue", jobData);

	await db
		.update(submissions)
		.set({ verdict: "judging" })
		.where(eq(submissions.id, job.submissionId));
}

export async function pushAnigmaTask1Job(job: {
	submissionId: number;
	problemId: number;
	inputPath: string;
	referenceCodePath: string;
	solutionCodePath: string;
	timeLimit: number;
	memoryLimit: number;
}) {
	const redis = await getRedisClient();

	const jobData = JSON.stringify({
		job_type: "anigma_task1",
		submission_id: job.submissionId,
		problem_id: job.problemId,
		input_path: job.inputPath,
		reference_code_path: job.referenceCodePath,
		solution_code_path: job.solutionCodePath,
		time_limit: job.timeLimit,
		memory_limit: job.memoryLimit,
	});

	await redis.rpush("judge:queue", jobData);

	await db
		.update(submissions)
		.set({ verdict: "judging" })
		.where(eq(submissions.id, job.submissionId));
}

export async function pushAnigmaTask2Job(job: {
	submissionId: number;
	problemId: number;
	zipPath: string;
	referenceCodePath: string;
	timeLimit: number;
	memoryLimit: number;
	maxScore: number;
	testcases: { id: number; inputPath: string; outputPath: string }[];
	contestId?: number;
}) {
	const redis = await getRedisClient();

	const jobData = JSON.stringify({
		job_type: "anigma",
		submission_id: job.submissionId,
		problem_id: job.problemId,
		zip_path: job.zipPath,
		reference_code_path: job.referenceCodePath,
		time_limit: job.timeLimit,
		memory_limit: job.memoryLimit,
		max_score: job.maxScore,
		testcases: job.testcases.map((tc) => ({
			id: tc.id,
			input_path: tc.inputPath,
			expected_output_path: tc.outputPath,
		})),
		contest_id: job.contestId,
	});

	await redis.rpush("judge:queue", jobData);

	await db
		.update(submissions)
		.set({ verdict: "judging" })
		.where(eq(submissions.id, job.submissionId));
}

/**
 * Enqueue a `workshop_validate` job. Wire format is defined in
 * `docs/superpowers/plans/2026-04-15-workshop-phase3.md` and implemented
 * in `judge/src/jobs/workshop/validate.rs`.
 */
export async function pushWorkshopValidateJob(job: {
	jobId: string;
	problemId: number;
	userId: number;
	testcaseId: number;
	language: string;
	validatorSourcePath: string;
	inputPath: string;
	resources: { name: string; storage_path: string }[];
	timeLimitMs: number;
	memoryLimitMb: number;
}) {
	const redis = await getRedisClient();

	const jobData = JSON.stringify({
		job_type: "workshop_validate",
		job_id: job.jobId,
		problem_id: job.problemId,
		user_id: job.userId,
		testcase_id: job.testcaseId,
		language: job.language,
		validator_source_path: job.validatorSourcePath,
		input_path: job.inputPath,
		resources: job.resources,
		time_limit_ms: job.timeLimitMs,
		memory_limit_mb: job.memoryLimitMb,
	});

	await redis.rpush("judge:queue", jobData);
}

export type WorkshopInvokeResource = {
	name: string;
	path: string;
};

export type WorkshopInvokeChecker = {
	language: "cpp";
	source_path: string;
};

/**
 * Enqueue a single workshop_invoke job.
 * - `job_id` is a unique identifier used as the Redis result key suffix.
 *   Phase 6 convention: `${invocationId}:${solutionId}:${testcaseId}`.
 * - `answer_path` is required in practice — the web layer pre-checks
 *   `testcase.outputPath !== null` before calling this.
 * - `stdout_upload_path` is optional; when set, judge uploads full stdout
 *   to that MinIO key. Used by both "Run Invocation" (to store cell output
 *   for the detail modal) and "정답 생성" (where the upload path IS the
 *   testcase's output.txt key and the checker is omitted).
 */
export async function pushWorkshopInvokeJob(job: {
	jobId: string;
	problemId: number;
	userId: number;
	invocationId: string;
	solutionId: number;
	testcaseId: number;
	language: string;
	solutionSourcePath: string;
	inputPath: string;
	answerPath: string | null;
	resources: WorkshopInvokeResource[];
	checker: WorkshopInvokeChecker | null;
	baseTimeLimitMs: number;
	baseMemoryLimitMb: number;
	stdoutUploadPath: string | null;
}) {
	const { getRedisClient } = await import("@/lib/redis");
	const redis = await getRedisClient();

	const payload: Record<string, unknown> = {
		job_type: "workshop_invoke",
		job_id: job.jobId,
		problem_id: job.problemId,
		user_id: job.userId,
		invocation_id: job.invocationId,
		solution_id: job.solutionId,
		testcase_id: job.testcaseId,
		language: job.language,
		solution_source_path: job.solutionSourcePath,
		input_path: job.inputPath,
		resources: job.resources,
		base_time_limit_ms: job.baseTimeLimitMs,
		base_memory_limit_mb: job.baseMemoryLimitMb,
	};
	if (job.answerPath !== null) payload.answer_path = job.answerPath;
	if (job.checker !== null) payload.checker = job.checker;
	if (job.stdoutUploadPath !== null) payload.stdout_upload_path = job.stdoutUploadPath;

	await redis.rpush("judge:queue", JSON.stringify(payload));
}
