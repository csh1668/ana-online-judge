import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contestParticipants, contestProblems, contests } from "@/db/schema";

export async function validateContestSubmission(data: {
	contestId: number;
	problemId: number;
	userId: number;
}): Promise<{ error?: string }> {
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

	return {};
}
