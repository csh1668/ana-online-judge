import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { submissionResults, submissions } from "@/db/schema";
import { checkContestSubmissionAccess } from "@/lib/submission-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const submissionId = parseInt(id, 10);

	if (Number.isNaN(submissionId)) {
		return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
	}

	const [submission] = await db
		.select({
			id: submissions.id,
			verdict: submissions.verdict,
			executionTime: submissions.executionTime,
			memoryUsed: submissions.memoryUsed,
			score: submissions.score,
			editDistance: submissions.editDistance,
			userId: submissions.userId,
			contestId: submissions.contestId,
		})
		.from(submissions)
		.where(eq(submissions.id, submissionId))
		.limit(1);

	if (!submission) {
		return NextResponse.json({ error: "Submission not found" }, { status: 404 });
	}

	const forbidden = await checkContestSubmissionAccess(submission);
	if (forbidden) return forbidden;

	// Check if judging is complete
	const isComplete = submission.verdict !== "pending" && submission.verdict !== "judging";

	// Get testcase results if judging is complete
	const testcaseResults = isComplete
		? await db
				.select({
					verdict: submissionResults.verdict,
					executionTime: submissionResults.executionTime,
					memoryUsed: submissionResults.memoryUsed,
				})
				.from(submissionResults)
				.where(eq(submissionResults.submissionId, submissionId))
				.orderBy(submissionResults.testcaseId)
		: [];

	const { userId: _, contestId: __, ...submissionData } = submission;
	return NextResponse.json({
		...submissionData,
		testcaseResults,
		isComplete,
	});
}
