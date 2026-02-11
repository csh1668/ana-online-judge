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
		problem_type: job.problemType,
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
