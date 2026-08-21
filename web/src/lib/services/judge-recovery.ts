import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { problems, submissions, testcases } from "@/db/schema";
import { pushStandardJudgeJob } from "@/lib/judge-queue";
import { notifySubmissionUpdate } from "@/lib/sse-manager";

/**
 * 결과도 큐에도 없이 유실된 제출을 다시 채점 큐에 넣는다.
 *
 * 반환값:
 * - "requeued": 채점 큐에 재투입 완료.
 * - "already_final": sweep 시작 이후 이미 verdict가 확정되어(pending/judging이 아님)
 *   재투입을 건너뜀 — 호출자는 DB를 건드리지 말고 그대로 넘어가야 한다.
 * - "cannot_rebuild": submission row가 없거나(orphan) anigma 제출이라 job 재구성이
 *   불가능함 — 호출자가 lost로 마킹해야 한다.
 */
export async function requeueLostSubmission(
	submissionId: number
): Promise<"requeued" | "already_final" | "cannot_rebuild"> {
	const [row] = await db
		.select({
			id: submissions.id,
			problemId: submissions.problemId,
			code: submissions.code,
			language: submissions.language,
			verdict: submissions.verdict,
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

	if (!row) return "cannot_rebuild";

	if (row.verdict !== "pending" && row.verdict !== "judging") return "already_final";

	if (row.problemType === "anigma") return "cannot_rebuild";

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
	return "requeued";
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
		.where(
			and(eq(submissions.id, submissionId), inArray(submissions.verdict, ["pending", "judging"]))
		);
	await notifySubmissionUpdate(submissionId);
}
