import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { problems, submissions, testcases } from "@/db/schema";
import { pushStandardJudgeJob } from "@/lib/judge-queue";
import { notifySubmissionUpdate } from "@/lib/sse-manager";

/**
 * 결과도 큐에도 없이 유실된 제출을 다시 채점 큐에 넣는다.
 * anigma 제출은 job 재구성이 불가능하므로 false를 반환한다(호출자가 lost 마킹).
 */
export async function requeueLostSubmission(submissionId: number): Promise<boolean> {
	const [row] = await db
		.select({
			id: submissions.id,
			problemId: submissions.problemId,
			code: submissions.code,
			language: submissions.language,
			problemType: problems.problemType,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			maxScore: problems.maxScore,
			hasSubtasks: problems.hasSubtasks,
			useFullJudge: problems.useFullJudge,
			passThreshold: problems.passThreshold,
			checkerPath: problems.checkerPath,
		})
		.from(submissions)
		.innerJoin(problems, eq(problems.id, submissions.problemId))
		.where(eq(submissions.id, submissionId))
		.limit(1);

	if (!row || row.problemType === "anigma") return false;

	const tcs = await db
		.select({
			id: testcases.id,
			inputPath: testcases.inputPath,
			outputPath: testcases.outputPath,
			subtaskGroup: testcases.subtaskGroup,
			score: testcases.score,
		})
		.from(testcases)
		.where(eq(testcases.problemId, row.problemId));

	await pushStandardJudgeJob({
		submissionId: row.id,
		problemId: row.problemId,
		code: row.code,
		language: row.language,
		timeLimit: row.timeLimit,
		memoryLimit: row.memoryLimit,
		maxScore: row.maxScore,
		hasSubtasks: row.hasSubtasks,
		useFullJudge: row.useFullJudge,
		passThreshold: row.passThreshold,
		testcases: tcs.map((tc) => ({
			id: tc.id,
			inputPath: tc.inputPath,
			outputPath: tc.outputPath,
			subtaskGroup: tc.subtaskGroup ?? 0,
			score: tc.score ?? 0,
		})),
		problemType: row.problemType,
		checkerPath: row.checkerPath,
	});
	return true;
}

/** 자동 복구가 불가능한 제출을 system_error로 확정하고 SSE 통지한다. */
export async function markSubmissionLost(submissionId: number): Promise<void> {
	await db
		.update(submissions)
		.set({
			verdict: "system_error",
			errorMessage:
				"채점 결과가 유실되어 자동 복구에 실패했습니다. 관리자에게 재채점을 요청해 주세요.",
		})
		.where(eq(submissions.id, submissionId));
	await notifySubmissionUpdate(submissionId);
}
