import { and, asc, count, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	contestProblems,
	type Language,
	languageEnum,
	problems,
	type SubmissionVisibility,
	submissionResults,
	submissions,
	testcases,
	users,
	type Verdict,
} from "@/db/schema";
import { validateContestSubmission } from "@/lib/contest-validation";
import { pushStandardJudgeJob } from "@/lib/judge-queue";
import { ANIGMA_SOLVED_THRESHOLD } from "@/lib/services/solved-clause";
import { getUserDefaultVisibility } from "@/lib/services/users";

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

		if (
			problem.allowedLanguages &&
			problem.allowedLanguages.length > 0 &&
			!problem.allowedLanguages.includes(data.language)
		) {
			return { error: "이 문제에서 허용되지 않는 언어입니다." };
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

		const visibility = await getUserDefaultVisibility(data.userId);

		const [newSubmission] = await db
			.insert(submissions)
			.values({
				problemId: data.problemId,
				userId: data.userId,
				code: data.code,
				language: data.language as Language,
				verdict: "pending",
				contestId: data.contestId,
				codeLength: new TextEncoder().encode(data.code).byteLength,
				visibility,
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
			hasSubtasks: problem.hasSubtasks,
			testcases: problemTestcases.map((tc) => ({
				id: tc.id,
				inputPath: tc.inputPath,
				outputPath: tc.outputPath,
				subtaskGroup: tc.subtaskGroup ?? 0,
				score: tc.score ?? 0,
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

/**
 * 제출 목록을 조회한다. 가시성 필터(`extraWhere`)는 호출 측 액션/라우트가
 * `lib/submission-access.ts:buildSubmissionListVisibilityWhere` 로 빌드해 주입한다.
 * 서비스는 raw row 만 반환 — `codeAccess` augment는 호출 측 책임.
 */
export async function getSubmissions(options?: {
	page?: number;
	limit?: number;
	userId?: number;
	problemId?: number;
	contestId?: number;
	username?: string;
	verdict?: string;
	language?: string;
	sort?: "id" | "executionTime" | "memoryUsed" | "createdAt";
	order?: "asc" | "desc";
	extraWhere?: SQL;
}) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const sort = options?.sort ?? "createdAt";
	const order = options?.order ?? "desc";

	const conditions: SQL[] = [];

	if (options?.userId) conditions.push(eq(submissions.userId, options.userId));
	if (options?.problemId) conditions.push(eq(submissions.problemId, options.problemId));
	if (options?.contestId) conditions.push(eq(submissions.contestId, options.contestId));
	if (options?.username) {
		conditions.push(
			or(
				sql`${users.name} ILIKE ${`%${options.username}%`}`,
				sql`${users.username} ILIKE ${`%${options.username}%`}`
			)!
		);
	}
	if (options?.verdict && options.verdict !== "all") {
		conditions.push(eq(submissions.verdict, options.verdict as Verdict));
	}
	if (options?.language && options.language !== "all") {
		conditions.push(eq(submissions.language, options.language as Language));
	}
	if (options?.extraWhere) conditions.push(options.extraWhere);

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
				problemTitle: problems.displayTitle,
				problemType: problems.problemType,
				problemIsPublic: problems.isPublic,
				maxScore: problems.maxScore,
				userId: submissions.userId,
				userName: users.name,
				userUsername: users.username,
				language: submissions.language,
				verdict: submissions.verdict,
				executionTime: submissions.executionTime,
				memoryUsed: submissions.memoryUsed,
				codeLength: submissions.codeLength,
				score: submissions.score,
				createdAt: submissions.createdAt,
				anigmaTaskType: submissions.anigmaTaskType,
				contestId: submissions.contestId,
				contestProblemLabel: contestProblems.label,
				visibility: submissions.visibility,
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

/**
 * 제출 상세를 raw 형태로 반환. `code` redaction과 `codeAccess` 결정은 호출 측 책임.
 */
export async function getSubmissionById(id: number) {
	const result = await db
		.select({
			id: submissions.id,
			problemId: submissions.problemId,
			problemTitle: problems.displayTitle,
			problemType: problems.problemType,
			problemIsPublic: problems.isPublic,
			maxScore: problems.maxScore,
			hasSubtasks: problems.hasSubtasks,
			userId: submissions.userId,
			userName: users.name,
			userUsername: users.username,
			code: submissions.code,
			language: submissions.language,
			verdict: submissions.verdict,
			executionTime: submissions.executionTime,
			memoryUsed: submissions.memoryUsed,
			codeLength: submissions.codeLength,
			errorMessage: submissions.errorMessage,
			score: submissions.score,
			editDistance: submissions.editDistance,
			createdAt: submissions.createdAt,
			anigmaTaskType: submissions.anigmaTaskType,
			anigmaInputPath: submissions.anigmaInputPath,
			zipPath: submissions.zipPath,
			contestId: submissions.contestId,
			contestProblemLabel: contestProblems.label,
			visibility: submissions.visibility,
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
		.select({
			id: submissionResults.id,
			submissionId: submissionResults.submissionId,
			testcaseId: submissionResults.testcaseId,
			verdict: submissionResults.verdict,
			executionTime: submissionResults.executionTime,
			memoryUsed: submissionResults.memoryUsed,
			checkerMessage: submissionResults.checkerMessage,
			createdAt: submissionResults.createdAt,
			subtaskGroup: testcases.subtaskGroup,
			score: testcases.score,
		})
		.from(submissionResults)
		.leftJoin(testcases, eq(testcases.id, submissionResults.testcaseId))
		.where(eq(submissionResults.submissionId, id))
		.orderBy(submissionResults.testcaseId);

	return { ...submission, testcaseResults: tcResults };
}

/**
 * 제출 visibility 를 변경한다. 권한/대회 검증은 호출 측에서 수행.
 * 존재하지 않는 id 면 null 반환.
 */
export async function updateSubmissionVisibility(
	submissionId: number,
	visibility: SubmissionVisibility
): Promise<{ problemId: number; ownerUsername: string } | null> {
	const [row] = await db
		.select({
			userId: submissions.userId,
			contestId: submissions.contestId,
			problemId: submissions.problemId,
			ownerUsername: users.username,
		})
		.from(submissions)
		.innerJoin(users, eq(users.id, submissions.userId))
		.where(eq(submissions.id, submissionId))
		.limit(1);
	if (!row) return null;

	await db.update(submissions).set({ visibility }).where(eq(submissions.id, submissionId));
	return { problemId: row.problemId, ownerUsername: row.ownerUsername };
}

/**
 * Visibility 변경 전 권한/대회 검증을 위한 헬퍼.
 * 대상 row의 owner와 contest 여부만 가볍게 노출 — 호출 측이 viewer와 비교한다.
 */
export async function getSubmissionOwnerInfo(
	submissionId: number
): Promise<{ userId: number; contestId: number | null } | null> {
	const [row] = await db
		.select({ userId: submissions.userId, contestId: submissions.contestId })
		.from(submissions)
		.where(eq(submissions.id, submissionId))
		.limit(1);
	return row ?? null;
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
		hasSubtasks: problem.hasSubtasks,
		testcases: problemTestcases.map((tc) => ({
			id: tc.id,
			inputPath: tc.inputPath,
			outputPath: tc.outputPath,
			subtaskGroup: tc.subtaskGroup ?? 0,
			score: tc.score ?? 0,
		})),
		problemType: problem.problemType,
		checkerPath: problem.checkerPath,
	});

	return { success: true, submissionId: id };
}

/** Get user's best submission status for multiple problems */
export async function getUserProblemStatuses(
	problemIds: number[],
	userId: number,
	contestId?: number
) {
	if (problemIds.length === 0) {
		return new Map<number, { solved: boolean; score: number | null }>();
	}

	const conditions = [
		eq(submissions.userId, userId),
		eq(submissions.verdict, "accepted"),
		sql`${submissions.problemId} IN ${problemIds}`,
	];

	if (contestId) {
		conditions.push(eq(submissions.contestId, contestId));
	}

	const userSubmissions = await db
		.select({
			problemId: submissions.problemId,
			score: submissions.score,
			problemType: problems.problemType,
			anigmaTaskType: submissions.anigmaTaskType,
		})
		.from(submissions)
		.innerJoin(problems, eq(submissions.problemId, problems.id))
		.where(and(...conditions));

	// For ANIGMA problems, calculate total score from Task 1 + Task 2
	const anigmaScores = new Map<number, { task1: number; task2: number }>();
	const nonAnigmaScores = new Map<number, number | null>();

	for (const sub of userSubmissions) {
		if (sub.problemType === "anigma") {
			const existing = anigmaScores.get(sub.problemId) ?? { task1: 0, task2: 0 };
			const score = sub.score ?? 0;

			if (sub.anigmaTaskType === 1) {
				anigmaScores.set(sub.problemId, {
					...existing,
					task1: Math.max(existing.task1, score),
				});
			} else if (sub.anigmaTaskType === 2) {
				anigmaScores.set(sub.problemId, {
					...existing,
					task2: Math.max(existing.task2, score),
				});
			}
		} else {
			nonAnigmaScores.set(sub.problemId, sub.score);
		}
	}

	// Build final status map
	const statusMap = new Map<number, { solved: boolean; score: number | null }>();

	for (const [problemId, scores] of anigmaScores.entries()) {
		const totalScore = scores.task1 + scores.task2;
		statusMap.set(problemId, {
			solved: totalScore >= ANIGMA_SOLVED_THRESHOLD,
			score: totalScore,
		});
	}

	for (const [problemId, _score] of nonAnigmaScores.entries()) {
		statusMap.set(problemId, {
			solved: true,
			score: null,
		});
	}

	return statusMap;
}
