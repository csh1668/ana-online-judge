"use server";

import { and, count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { problems, submissionResults, submissions, testcases, users } from "@/db/schema";

export type SubmissionListItem = {
	id: number;
	problemId: number;
	problemTitle: string;
	userId: number;
	userName: string;
	language: string;
	verdict: string;
	executionTime: number | null;
	memoryUsed: number | null;
	createdAt: Date;
};

export async function getSubmissions(options?: {
	page?: number;
	limit?: number;
	userId?: number;
	problemId?: number;
}): Promise<{ submissions: SubmissionListItem[]; total: number }> {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const conditions = [];
	if (options?.userId) {
		conditions.push(eq(submissions.userId, options.userId));
	}
	if (options?.problemId) {
		conditions.push(eq(submissions.problemId, options.problemId));
	}

	const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

	const [submissionsList, totalResult] = await Promise.all([
		db
			.select({
				id: submissions.id,
				problemId: submissions.problemId,
				problemTitle: problems.title,
				userId: submissions.userId,
				userName: users.name,
				language: submissions.language,
				verdict: submissions.verdict,
				executionTime: submissions.executionTime,
				memoryUsed: submissions.memoryUsed,
				createdAt: submissions.createdAt,
			})
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.innerJoin(users, eq(submissions.userId, users.id))
			.where(whereCondition)
			.orderBy(desc(submissions.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(submissions).where(whereCondition),
	]);

	return {
		submissions: submissionsList,
		total: totalResult[0].count,
	};
}

export async function getSubmissionById(id: number) {
	const result = await db
		.select({
			id: submissions.id,
			problemId: submissions.problemId,
			problemTitle: problems.title,
			userId: submissions.userId,
			userName: users.name,
			code: submissions.code,
			language: submissions.language,
			verdict: submissions.verdict,
			executionTime: submissions.executionTime,
			memoryUsed: submissions.memoryUsed,
			errorMessage: submissions.errorMessage,
			score: submissions.score,
			createdAt: submissions.createdAt,
		})
		.from(submissions)
		.innerJoin(problems, eq(submissions.problemId, problems.id))
		.innerJoin(users, eq(submissions.userId, users.id))
		.where(eq(submissions.id, id))
		.limit(1);

	if (result.length === 0) return null;

	// Get testcase results
	const tcResults = await db
		.select()
		.from(submissionResults)
		.where(eq(submissionResults.submissionId, id))
		.orderBy(submissionResults.testcaseId);

	return {
		...result[0],
		testcaseResults: tcResults,
	};
}

export async function submitCode(data: {
	problemId: number;
	code: string;
	language: string;
	userId: number;
}): Promise<{ submissionId?: number; error?: string }> {
	try {
		// Validate problem exists
		const problem = await db
			.select()
			.from(problems)
			.where(eq(problems.id, data.problemId))
			.limit(1);

		if (problem.length === 0) {
			return { error: "문제를 찾을 수 없습니다." };
		}

		// Validate language
		const validLanguages = ["c", "cpp", "python", "java"];
		if (!validLanguages.includes(data.language)) {
			return { error: "지원하지 않는 언어입니다." };
		}

		// Create submission
		const [newSubmission] = await db
			.insert(submissions)
			.values({
				problemId: data.problemId,
				userId: data.userId,
				code: data.code,
				language: data.language as "c" | "cpp" | "python" | "java",
				verdict: "pending",
			})
			.returning({ id: submissions.id });

		// Get testcases for this problem
		const problemTestcases = await db
			.select()
			.from(testcases)
			.where(eq(testcases.problemId, data.problemId));

		// Push job to Redis queue (to be processed by Judge Worker)
		await pushJudgeJob({
			submissionId: newSubmission.id,
			problemId: data.problemId,
			code: data.code,
			language: data.language,
			timeLimit: problem[0].timeLimit,
			memoryLimit: problem[0].memoryLimit,
			testcases: problemTestcases.map((tc) => ({
				id: tc.id,
				inputPath: tc.inputPath,
				outputPath: tc.outputPath,
			})),
		});

		revalidatePath("/submissions");
		revalidatePath(`/problems/${data.problemId}`);

		return { submissionId: newSubmission.id };
	} catch (error) {
		console.error("Submit error:", error);
		return { error: "제출 중 오류가 발생했습니다." };
	}
}

// Push job to Redis queue
async function pushJudgeJob(job: {
	submissionId: number;
	problemId: number;
	code: string;
	language: string;
	timeLimit: number;
	memoryLimit: number;
	testcases: { id: number; inputPath: string; outputPath: string }[];
}) {
	// Import redis client dynamically to avoid client-side import
	const { getRedisClient } = await import("@/lib/redis");
	const redis = await getRedisClient();

	const jobData = JSON.stringify({
		submission_id: job.submissionId,
		problem_id: job.problemId,
		code: job.code,
		language: job.language,
		time_limit: job.timeLimit,
		// TODO: Add ignore time/memory limit bonus option
		ignore_time_limit_bonus: false,
		memory_limit: job.memoryLimit,
		ignore_memory_limit_bonus: false,
		testcases: job.testcases.map((tc) => ({
			id: tc.id,
			input_path: tc.inputPath,
			output_path: tc.outputPath,
		})),
	});

	await redis.rpush("judge:queue", jobData);

	// Update submission status to judging
	await db
		.update(submissions)
		.set({ verdict: "judging" })
		.where(eq(submissions.id, job.submissionId));
}
