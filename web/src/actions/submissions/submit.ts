"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { problems, submissions, testcases } from "@/db/schema";
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
		// Validate problem exists
		const [problem] = await db
			.select()
			.from(problems)
			.where(eq(problems.id, data.problemId))
			.limit(1);

		if (!problem) {
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
			const validation = await validateContestSubmission({
				contestId: data.contestId,
				problemId: data.problemId,
				userId: data.userId,
			});
			if (validation.error) return { error: validation.error };
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

		revalidatePath("/submissions");
		revalidatePath(`/problems/${data.problemId}`);

		return { submissionId: newSubmission.id };
	} catch (error) {
		console.error("Submit error:", error);
		return { error: "제출 중 오류가 발생했습니다." };
	}
}

export type SubmitCodeResult = Awaited<ReturnType<typeof submitCode>>;
