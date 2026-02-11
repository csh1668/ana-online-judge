"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
	contestParticipants,
	contestProblems,
	contests,
	problems,
	submissions,
	users,
} from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";
import type {
	SpotboardConfig,
	SpotboardProblem,
	SpotboardRun,
	SpotboardTeam,
} from "@/lib/spotboard/types";

// Get Spotboard Data
export async function getSpotboardData(contestId: number): Promise<SpotboardConfig> {
	const { userId, isAdmin } = await getSessionInfo();

	// Get contest info
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);

	if (!contest) {
		throw new Error("Contest not found");
	}

	// Check if contest is finished (scoreboard is public after endTime)
	const now = new Date();
	const isFinished = now > contest.endTime;

	// Check access for private contests (only check if contest is not finished)
	if (contest.visibility === "private" && !isAdmin && !isFinished) {
		if (!userId) {
			throw new Error("Unauthorized");
		}
		const [participant] = await db
			.select()
			.from(contestParticipants)
			.where(
				and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
			)
			.limit(1);

		if (!participant) {
			throw new Error("Unauthorized");
		}
	}

	// Check freeze state
	const contestEndTime = new Date(contest.endTime);
	const freezeTime = contest.freezeMinutes
		? new Date(contestEndTime.getTime() - contest.freezeMinutes * 60 * 1000)
		: null;

	// Determine if we should mask results (Freeze logic)
	// We mask results if:
	// 1. Not Admin AND
	// 2. Contest is Frozen AND
	// 3. (Current time >= Freeze Time)
	// Even if contest is over, if it is still marked 'isFrozen', we mask results.
	const shouldMask = !isAdmin && contest.isFrozen && freezeTime && now >= freezeTime;

	// Get contest problems
	const contestProblemsList = await db
		.select({
			label: contestProblems.label,
			problemId: contestProblems.problemId,
			title: problems.title,
			problemType: problems.problemType,
			color: problems.title, // Use title as color placeholder or add color to schema later
			order: contestProblems.order,
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(eq(contestProblems.contestId, contestId))
		.orderBy(contestProblems.order);

	const spotboardProblems: SpotboardProblem[] = contestProblemsList.map((p) => ({
		id: p.problemId,
		title: p.label, // Spotboard uses short name (A, B, C) as title/name usually
		color: "", // TODO: Add color support
		problemType: p.problemType,
	}));

	// Get participants (Teams)
	const participantsList = await db
		.select({
			userId: contestParticipants.userId,
			username: users.username,
			name: users.name,
		})
		.from(contestParticipants)
		.innerJoin(users, eq(contestParticipants.userId, users.id))
		.where(eq(contestParticipants.contestId, contestId));

	const spotboardTeams: SpotboardTeam[] = participantsList.map((p) => ({
		id: p.userId,
		name: p.name, // or p.username
		group: p.username,
	}));

	// Get submissions (Runs)
	const submissionsList = await db
		.select({
			id: submissions.id,
			userId: submissions.userId,
			problemId: submissions.problemId,
			verdict: submissions.verdict,
			score: submissions.score,
			anigmaTaskType: submissions.anigmaTaskType,
			editDistance: submissions.editDistance,
			createdAt: submissions.createdAt,
		})
		.from(submissions)
		.where(
			and(
				eq(submissions.contestId, contestId),
				gte(submissions.createdAt, contest.startTime),
				lte(submissions.createdAt, contest.endTime)
			)
		)
		.orderBy(submissions.createdAt);

	const spotboardRuns: SpotboardRun[] = [];
	const startTimeMs = new Date(contest.startTime).getTime();

	let freezeTimeSeconds: number | undefined;
	if (contest.freezeMinutes) {
		const durationSeconds = Math.floor((contestEndTime.getTime() - startTimeMs) / 1000);
		freezeTimeSeconds = durationSeconds - contest.freezeMinutes * 60;
	}

	// Track ANIGMA task scores per team/problem (for calculating cumulative best scores)
	// Map<teamId, Map<problemId, { task1Max: number, task2Max: number }>>
	const anigmaBestScores = new Map<number, Map<number, { task1Max: number; task2Max: number }>>();

	for (const sub of submissionsList) {
		const subTime = new Date(sub.createdAt);
		const timeSeconds = Math.floor((subTime.getTime() - startTimeMs) / 1000);

		// Get problem type
		const problemInfo = contestProblemsList.find((p) => p.problemId === sub.problemId);
		const problemType = problemInfo?.problemType;

		let result = "Pending";
		if (shouldMask && freezeTime && subTime >= freezeTime) {
			result = "Pending";
		} else {
			// Map verdict to Spotboard result
			if (sub.verdict === "accepted") result = "Yes";
			else if (sub.verdict === "pending" || sub.verdict === "judging") result = "Pending";
			else result = "No";
		}

		// Calculate anigmaDetails for ANIGMA problems
		let anigmaDetails: SpotboardRun["anigmaDetails"];
		if (problemType === "anigma" && sub.anigmaTaskType && sub.verdict === "accepted") {
			// Get or create team/problem score tracker
			let teamScores = anigmaBestScores.get(sub.userId);
			if (!teamScores) {
				teamScores = new Map();
				anigmaBestScores.set(sub.userId, teamScores);
			}

			let problemScores = teamScores.get(sub.problemId);
			if (!problemScores) {
				problemScores = { task1Max: 0, task2Max: 0 };
				teamScores.set(sub.problemId, problemScores);
			}

			// Update max scores based on task type
			if (sub.anigmaTaskType === 1) {
				problemScores.task1Max = Math.max(problemScores.task1Max, sub.score ?? 0);
			} else if (sub.anigmaTaskType === 2) {
				problemScores.task2Max = Math.max(problemScores.task2Max, sub.score ?? 0);
			}

			// Set anigmaDetails with current cumulative best scores
			anigmaDetails = {
				task1Score: problemScores.task1Max,
				task2Score: problemScores.task2Max,
				editDistance: sub.editDistance ?? null,
			};
		}

		spotboardRuns.push({
			id: sub.id,
			teamId: sub.userId,
			problemId: sub.problemId,
			time: timeSeconds,
			result: result,
			score: sub.score ?? undefined,
			problemType: problemType,
			anigmaDetails: anigmaDetails,
		});
	}

	return {
		contestTitle: contest.title,
		systemName: "Ana Online Judge",
		systemVersion: "1.0",
		problems: spotboardProblems,
		teams: spotboardTeams,
		runs: spotboardRuns,
		freezeTime: freezeTimeSeconds,
	};
}
