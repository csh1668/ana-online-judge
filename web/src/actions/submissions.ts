"use server";

import { and, count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	contestParticipants,
	contestProblems,
	problems,
	submissionResults,
	submissions,
	testcases,
	users,
} from "@/db/schema";

export async function getSubmissions(options?: {
	page?: number;
	limit?: number;
	userId?: number;
	problemId?: number;
}) {
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

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
				problemIsPublic: problems.isPublic,
				maxScore: problems.maxScore,
				userId: submissions.userId,
				userName: users.name,
				language: submissions.language,
				verdict: submissions.verdict,
				executionTime: submissions.executionTime,
				memoryUsed: submissions.memoryUsed,
				score: submissions.score,
				createdAt: submissions.createdAt,
				anigmaTaskType: submissions.anigmaTaskType,
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

	// Filter submissions based on problem visibility
	let filteredSubmissions = submissionsList;

	if (!isAdmin) {
		// Get contest problem IDs that the user is participating in
		const accessibleContestProblemIds = currentUserId
			? await db
					.select({ problemId: contestProblems.problemId })
					.from(contestProblems)
					.innerJoin(
						contestParticipants,
						eq(contestProblems.contestId, contestParticipants.contestId)
					)
					.where(eq(contestParticipants.userId, currentUserId))
					.then((rows) => rows.map((r) => r.problemId))
			: [];

		// Filter: public problems OR user's own submissions OR contest problems
		filteredSubmissions = submissionsList.filter((sub) => {
			// Public problems - everyone can see
			if (sub.problemIsPublic) return true;

			// Own submissions - always visible
			if (currentUserId && sub.userId === currentUserId) return true;

			// Contest problems that user is participating in
			if (accessibleContestProblemIds.includes(sub.problemId)) return true;

			return false;
		});
	}

	return {
		submissions: filteredSubmissions,
		total: isAdmin ? totalResult[0].count : filteredSubmissions.length,
	};
}

export async function getSubmissionById(id: number) {
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	const result = await db
		.select({
			id: submissions.id,
			problemId: submissions.problemId,
			problemTitle: problems.title,
			problemType: problems.problemType,
			problemIsPublic: problems.isPublic,
			maxScore: problems.maxScore,
			userId: submissions.userId,
			userName: users.name,
			code: submissions.code,
			language: submissions.language,
			verdict: submissions.verdict,
			executionTime: submissions.executionTime,
			memoryUsed: submissions.memoryUsed,
			errorMessage: submissions.errorMessage,
			score: submissions.score,
			editDistance: submissions.editDistance,
			createdAt: submissions.createdAt,
			anigmaTaskType: submissions.anigmaTaskType,
			anigmaInputPath: submissions.anigmaInputPath,
			zipPath: submissions.zipPath,
		})
		.from(submissions)
		.innerJoin(problems, eq(submissions.problemId, problems.id))
		.innerJoin(users, eq(submissions.userId, users.id))
		.where(eq(submissions.id, id))
		.limit(1);

	if (result.length === 0) return null;

	const submission = result[0];

	// Check access permissions: Only admin and submission owner can view
	if (!isAdmin) {
		// Only own submissions are accessible
		if (!currentUserId || submission.userId !== currentUserId) {
			return null; // Access denied
		}
	}

	// Get testcase results
	const tcResults = await db
		.select()
		.from(submissionResults)
		.where(eq(submissionResults.submissionId, id))
		.orderBy(submissionResults.testcaseId);

	return {
		...submission,
		testcaseResults: tcResults,
	};
}

export async function submitCode(data: {
	problemId: number;
	code: string;
	language: string;
	userId: number;
	contestId?: number;
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

		// Validate code
		if (!data.code || data.code.trim().length === 0) {
			return { error: "코드를 입력해주세요." };
		}

		if (data.code.length > 1000000) {
			return { error: "코드가 너무 깁니다 (최대 1MB)." };
		}

		// Validate contest if provided
		if (data.contestId) {
			const { contests, contestProblems } = await import("@/db/schema");

			// Check if contest exists and is running
			const [contest] = await db
				.select()
				.from(contests)
				.where(eq(contests.id, data.contestId))
				.limit(1);

			if (!contest) {
				return { error: "대회를 찾을 수 없습니다." };
			}

			const now = new Date();
			if (now < contest.startTime) {
				return { error: "대회가 아직 시작되지 않았습니다." };
			}
			if (now > contest.endTime) {
				return { error: "대회가 종료되었습니다." };
			}

			// Check if problem is in contest
			const [contestProblem] = await db
				.select()
				.from(contestProblems)
				.where(
					and(
						eq(contestProblems.contestId, data.contestId),
						eq(contestProblems.problemId, data.problemId)
					)
				)
				.limit(1);

			if (!contestProblem) {
				return { error: "이 문제는 해당 대회에 포함되어 있지 않습니다." };
			}

			// Check if user is registered for the contest
			const { contestParticipants } = await import("@/db/schema");
			const [participant] = await db
				.select()
				.from(contestParticipants)
				.where(
					and(
						eq(contestParticipants.contestId, data.contestId),
						eq(contestParticipants.userId, data.userId)
					)
				)
				.limit(1);

			if (!participant) {
				return { error: "대회에 등록된 참가자가 아닙니다." };
			}
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
				contestId: data.contestId,
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
			maxScore: problem[0].maxScore,
			testcases: problemTestcases.map((tc) => ({
				id: tc.id,
				inputPath: tc.inputPath,
				outputPath: tc.outputPath,
			})),
			problemType: problem[0].problemType,
			checkerPath: problem[0].checkerPath,
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
	maxScore: number;
	testcases: { id: number; inputPath: string; outputPath: string }[];
	problemType: string;
	checkerPath: string | null;
}) {
	// Import redis client dynamically to avoid client-side import
	const { getRedisClient } = await import("@/lib/redis");
	const redis = await getRedisClient();

	const jobData = JSON.stringify({
		job_type: "judge",
		submission_id: job.submissionId,
		problem_id: job.problemId,
		code: job.code,
		language: job.language,
		time_limit: job.timeLimit,
		// TODO: Add ignore time/memory limit bonus option
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

	// Update submission status to judging
	await db
		.update(submissions)
		.set({ verdict: "judging" })
		.where(eq(submissions.id, job.submissionId));
}

export type GetSubmissionsReturn = Awaited<ReturnType<typeof getSubmissions>>;
export type SubmissionListItem = GetSubmissionsReturn["submissions"][number];
export type GetSubmissionByIdReturn = Awaited<ReturnType<typeof getSubmissionById>>;
export type SubmissionDetail = NonNullable<GetSubmissionByIdReturn>;
export type SubmitCodeResult = Awaited<ReturnType<typeof submitCode>>;
