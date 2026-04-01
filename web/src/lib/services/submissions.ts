import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
	contestProblems,
	type Language,
	languageEnum,
	problems,
	submissionResults,
	submissions,
	testcases,
	users,
	type Verdict,
} from "@/db/schema";
import { validateContestSubmission } from "@/lib/contest-validation";
import { pushStandardJudgeJob } from "@/lib/judge-queue";

export async function submitCode(data: {
	problemId: number;
	code: string;
	language: string;
	userId: number;
	contestId?: number;
}): Promise<{ submissionId?: number; error?: string }> {
	try {
		const [problem] = await db
			.select()
			.from(problems)
			.where(eq(problems.id, data.problemId))
			.limit(1);

		if (!problem) {
			return { error: "문제를 찾을 수 없습니다." };
		}

		const validLanguages = languageEnum.enumValues.map((x) => x.toString());
		if (!validLanguages.includes(data.language)) {
			return { error: "지원하지 않는 언어입니다." };
		}

		if (!data.code || data.code.trim().length === 0) {
			return { error: "코드를 입력해주세요." };
		}

		if (data.code.length > 1000000) {
			return { error: "코드가 너무 깁니다 (최대 1MB)." };
		}

		if (data.contestId) {
			const validation = await validateContestSubmission({
				contestId: data.contestId,
				problemId: data.problemId,
				userId: data.userId,
			});
			if (validation.error) return { error: validation.error };
		}

		const [newSubmission] = await db
			.insert(submissions)
			.values({
				problemId: data.problemId,
				userId: data.userId,
				code: data.code,
				language: data.language as Language,
				verdict: "pending",
				contestId: data.contestId,
			})
			.returning({ id: submissions.id });

		const problemTestcases = await db
			.select()
			.from(testcases)
			.where(eq(testcases.problemId, data.problemId));

		await pushStandardJudgeJob({
			submissionId: newSubmission.id,
			problemId: data.problemId,
			code: data.code,
			language: data.language,
			timeLimit: problem.timeLimit,
			memoryLimit: problem.memoryLimit,
			maxScore: problem.maxScore,
			testcases: problemTestcases.map((tc) => ({
				id: tc.id,
				inputPath: tc.inputPath,
				outputPath: tc.outputPath,
			})),
			problemType: problem.problemType,
			checkerPath: problem.checkerPath,
		});

		return { submissionId: newSubmission.id };
	} catch (error) {
		console.error("Submit error:", error);
		return { error: "제출 중 오류가 발생했습니다." };
	}
}

/** Admin query — no visibility filtering */
export async function getSubmissions(options?: {
	page?: number;
	limit?: number;
	userId?: number;
	problemId?: number;
	contestId?: number;
	verdict?: string;
	language?: string;
	sort?: "id" | "executionTime" | "memoryUsed" | "createdAt";
	order?: "asc" | "desc";
}) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const sort = options?.sort ?? "createdAt";
	const order = options?.order ?? "desc";

	const conditions = [];

	if (options?.userId) conditions.push(eq(submissions.userId, options.userId));
	if (options?.problemId) conditions.push(eq(submissions.problemId, options.problemId));
	if (options?.contestId) conditions.push(eq(submissions.contestId, options.contestId));
	if (options?.verdict && options.verdict !== "all") {
		conditions.push(eq(submissions.verdict, options.verdict as Verdict));
	}
	if (options?.language && options.language !== "all") {
		conditions.push(eq(submissions.language, options.language as Language));
	}

	const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

	let orderBy: SQL;
	switch (sort) {
		case "executionTime":
			orderBy = order === "asc" ? asc(submissions.executionTime) : desc(submissions.executionTime);
			break;
		case "memoryUsed":
			orderBy = order === "asc" ? asc(submissions.memoryUsed) : desc(submissions.memoryUsed);
			break;
		case "id":
			orderBy = order === "asc" ? asc(submissions.id) : desc(submissions.id);
			break;
		default:
			orderBy = order === "asc" ? asc(submissions.createdAt) : desc(submissions.createdAt);
			break;
	}

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
				score: submissions.score,
				createdAt: submissions.createdAt,
				contestId: submissions.contestId,
				contestProblemLabel: contestProblems.label,
			})
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.innerJoin(users, eq(submissions.userId, users.id))
			.leftJoin(
				contestProblems,
				and(
					eq(contestProblems.contestId, submissions.contestId),
					eq(contestProblems.problemId, submissions.problemId)
				)
			)
			.where(whereCondition)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset),
		db
			.select({ count: count() })
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.innerJoin(users, eq(submissions.userId, users.id))
			.leftJoin(
				contestProblems,
				and(
					eq(contestProblems.contestId, submissions.contestId),
					eq(contestProblems.problemId, submissions.problemId)
				)
			)
			.where(whereCondition),
	]);

	return { submissions: submissionsList, total: totalResult[0].count };
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
			editDistance: submissions.editDistance,
			createdAt: submissions.createdAt,
			anigmaTaskType: submissions.anigmaTaskType,
			contestId: submissions.contestId,
			contestProblemLabel: contestProblems.label,
		})
		.from(submissions)
		.innerJoin(problems, eq(submissions.problemId, problems.id))
		.innerJoin(users, eq(submissions.userId, users.id))
		.leftJoin(
			contestProblems,
			and(
				eq(contestProblems.contestId, submissions.contestId),
				eq(contestProblems.problemId, submissions.problemId)
			)
		)
		.where(eq(submissions.id, id))
		.limit(1);

	if (result.length === 0) return null;

	const submission = result[0];

	const tcResults = await db
		.select()
		.from(submissionResults)
		.where(eq(submissionResults.submissionId, id))
		.orderBy(submissionResults.testcaseId);

	return { ...submission, testcaseResults: tcResults };
}

export async function rejudgeSubmission(id: number) {
	const submission = await getSubmissionById(id);
	if (!submission) throw new Error("Submission not found");

	const [problem] = await db
		.select()
		.from(problems)
		.where(eq(problems.id, submission.problemId))
		.limit(1);

	if (!problem) throw new Error("Problem not found");

	// Clear old results
	await db.delete(submissionResults).where(eq(submissionResults.submissionId, id));
	await db
		.update(submissions)
		.set({
			verdict: "pending",
			executionTime: null,
			memoryUsed: null,
			score: null,
			errorMessage: null,
		})
		.where(eq(submissions.id, id));

	const problemTestcases = await db
		.select()
		.from(testcases)
		.where(eq(testcases.problemId, submission.problemId));

	await pushStandardJudgeJob({
		submissionId: id,
		problemId: submission.problemId,
		code: submission.code,
		language: submission.language,
		timeLimit: problem.timeLimit,
		memoryLimit: problem.memoryLimit,
		maxScore: problem.maxScore,
		testcases: problemTestcases.map((tc) => ({
			id: tc.id,
			inputPath: tc.inputPath,
			outputPath: tc.outputPath,
		})),
		problemType: problem.problemType,
		checkerPath: problem.checkerPath,
	});

	return { success: true, submissionId: id };
}
