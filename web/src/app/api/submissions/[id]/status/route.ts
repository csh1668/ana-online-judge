import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { submissionResults, submissions } from "@/db/schema";
import { getRedisClient } from "@/lib/redis";

const RESULT_KEY_PREFIX = "judge:result:";

interface JudgeResult {
	submission_id: number;
	verdict: string;
	execution_time: number | null;
	memory_used: number | null;
	error_message?: string | null;
	testcase_results: {
		testcase_id: number;
		verdict: string;
		execution_time: number | null;
		memory_used: number | null;
	}[];
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const submissionId = parseInt(id, 10);

	if (isNaN(submissionId)) {
		return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
	}

	const [submission] = await db
		.select({
			id: submissions.id,
			verdict: submissions.verdict,
			executionTime: submissions.executionTime,
			memoryUsed: submissions.memoryUsed,
			score: submissions.score,
		})
		.from(submissions)
		.where(eq(submissions.id, submissionId))
		.limit(1);

	if (!submission) {
		return NextResponse.json({ error: "Submission not found" }, { status: 404 });
	}

	// If still judging, check Redis for results
	if (submission.verdict === "judging" || submission.verdict === "pending") {
		try {
			const redis = await getRedisClient();
			const resultKey = `${RESULT_KEY_PREFIX}${submissionId}`;
			const resultJson = await redis.get(resultKey);

			if (resultJson) {
				const result: JudgeResult = JSON.parse(resultJson);

				// Update database with results
				await db
					.update(submissions)
					.set({
						verdict: result.verdict as
							| "pending"
							| "judging"
							| "accepted"
							| "wrong_answer"
							| "time_limit_exceeded"
							| "memory_limit_exceeded"
							| "runtime_error"
							| "compile_error"
							| "system_error",
						executionTime: result.execution_time,
						memoryUsed: result.memory_used,
						errorMessage: result.error_message ?? null,
					})
					.where(eq(submissions.id, submissionId));

				// Insert testcase results
				if (result.testcase_results && result.testcase_results.length > 0) {
					// Delete existing results first
					await db
						.delete(submissionResults)
						.where(eq(submissionResults.submissionId, submissionId));

					await db.insert(submissionResults).values(
						result.testcase_results.map((tc) => ({
							submissionId,
							testcaseId: tc.testcase_id,
							verdict: tc.verdict as
								| "pending"
								| "judging"
								| "accepted"
								| "wrong_answer"
								| "time_limit_exceeded"
								| "memory_limit_exceeded"
								| "runtime_error"
								| "compile_error"
								| "system_error",
							executionTime: tc.execution_time,
							memoryUsed: tc.memory_used,
						}))
					);
				}

				// Delete result from Redis
				await redis.del(resultKey);

				// Return updated data
				return NextResponse.json({
					id: submissionId,
					verdict: result.verdict,
					executionTime: result.execution_time,
					memoryUsed: result.memory_used,
					errorMessage: result.error_message ?? null,
					score: submission.score,
					testcaseResults: result.testcase_results.map((tc) => ({
						verdict: tc.verdict,
						executionTime: tc.execution_time,
						memoryUsed: tc.memory_used,
					})),
					isComplete: true,
				});
			}
		} catch (error) {
			console.error("Error checking Redis for results:", error);
		}

		// Still judging
		return NextResponse.json({
			...submission,
			testcaseResults: [],
			isComplete: false,
		});
	}

	// Get testcase results if judging is complete
	const testcaseResults = await db
		.select({
			verdict: submissionResults.verdict,
			executionTime: submissionResults.executionTime,
			memoryUsed: submissionResults.memoryUsed,
		})
		.from(submissionResults)
		.where(eq(submissionResults.submissionId, submissionId))
		.orderBy(submissionResults.testcaseId);

	return NextResponse.json({
		...submission,
		testcaseResults,
		isComplete: true,
	});
}
