"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	contestParticipants,
	contestProblems,
	contests,
	problems,
	submissions,
	users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";
import type {
	SpotboardConfig,
	SpotboardProblem,
	SpotboardRun,
	SpotboardTeam,
} from "@/lib/spotboard/types";

// Get Spotboard Data
export async function getSpotboardData(contestId: number): Promise<SpotboardConfig> {
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

	// Get contest info
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);

	if (!contest) {
		throw new Error("Contest not found");
	}

	// Check access for private contests
	if (contest.visibility === "private" && !isAdmin) {
		if (!session?.user?.id) {
			throw new Error("Unauthorized");
		}
		const [participant] = await db
			.select()
			.from(contestParticipants)
			.where(
				and(
					eq(contestParticipants.contestId, contestId),
					eq(contestParticipants.userId, parseInt(session.user.id, 10))
				)
			)
			.limit(1);

		if (!participant) {
			throw new Error("Unauthorized");
		}
	}

	// Check freeze state
	const now = new Date();
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

	let freezeTimeMinutes: number | undefined;
	if (contest.freezeMinutes) {
		const durationMinutes = (contestEndTime.getTime() - startTimeMs) / 60000;
		freezeTimeMinutes = durationMinutes - contest.freezeMinutes;
	}

	for (const sub of submissionsList) {
		const subTime = new Date(sub.createdAt);
		const timeMinutes = Math.floor((subTime.getTime() - startTimeMs) / 60000);

		let result = "Pending";
		if (shouldMask && freezeTime && subTime >= freezeTime) {
			result = "Pending";
		} else {
			// Map verdict to Spotboard result
			if (sub.verdict === "accepted") result = "Yes";
			else if (sub.verdict === "pending" || sub.verdict === "judging") result = "Pending";
			else result = "No";
		}

		spotboardRuns.push({
			id: sub.id,
			teamId: sub.userId,
			problemId: sub.problemId,
			time: timeMinutes,
			result: result,
		});
	}

	return {
		contestTitle: contest.title,
		systemName: "Ana Online Judge",
		systemVersion: "1.0",
		problems: spotboardProblems,
		teams: spotboardTeams,
		runs: spotboardRuns,
		freezeTime: freezeTimeMinutes,
	};
}

interface ScoreboardEntry {
	rank: number;
	userId: number;
	username: string;
	name: string;
	totalScore: number;
	penalty: number; // in minutes
	problems: {
		[label: string]: {
			problemType: "icpc" | "special_judge" | "anigma";
			// ICPC fields
			solved?: boolean;
			attempts?: number;
			solvedTime?: number; // minutes from contest start
			// ANIGMA fields
			score?: number;
			// Frozen state
			isFrozen?: boolean;
		};
	};
}

// Get Scoreboard
export async function getScoreboard(contestId: number) {
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

	// Get contest info
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);

	if (!contest) {
		throw new Error("Contest not found");
	}

	// Check access for private contests
	if (contest.visibility === "private" && !isAdmin) {
		// Check if user is a participant
		if (!session?.user?.id) {
			throw new Error("Unauthorized");
		}

		const [participant] = await db
			.select()
			.from(contestParticipants)
			.where(
				and(
					eq(contestParticipants.contestId, contestId),
					eq(contestParticipants.userId, parseInt(session.user.id, 10))
				)
			)
			.limit(1);

		if (!participant) {
			throw new Error("Unauthorized");
		}
	}

	// Check if contest is frozen
	const now = new Date();
	const contestEndTime = new Date(contest.endTime);
	const freezeTime = contest.freezeMinutes
		? new Date(contestEndTime.getTime() - contest.freezeMinutes * 60 * 1000)
		: null;

	const shouldFreeze = contest.isFrozen && freezeTime && now >= freezeTime;

	// Get contest problems
	const contestProblemsList = await db
		.select({
			label: contestProblems.label,
			problemId: contestProblems.problemId,
			problemType: problems.problemType,
			order: contestProblems.order,
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(eq(contestProblems.contestId, contestId))
		.orderBy(contestProblems.order);

	// Get participants
	const participantsList = await db
		.select({
			userId: contestParticipants.userId,
			username: users.username,
			name: users.name,
		})
		.from(contestParticipants)
		.innerJoin(users, eq(contestParticipants.userId, users.id))
		.where(eq(contestParticipants.contestId, contestId));

	// Get all submissions for this contest
	const submissionsList = await db
		.select({
			userId: submissions.userId,
			problemId: submissions.problemId,
			verdict: submissions.verdict,
			score: submissions.score,
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

	// Build scoreboard
	const scoreboard: ScoreboardEntry[] = [];

	for (const participant of participantsList) {
		const entry: ScoreboardEntry = {
			rank: 0,
			userId: participant.userId,
			username: participant.username,
			name: participant.name,
			totalScore: 0,
			penalty: 0,
			problems: {},
		};

		// Initialize problem entries
		for (const cp of contestProblemsList) {
			entry.problems[cp.label] = {
				problemType: cp.problemType,
			};
		}

		// Process submissions
		for (const submission of submissionsList) {
			if (submission.userId !== participant.userId) continue;

			const problemLabel = contestProblemsList.find(
				(p) => p.problemId === submission.problemId
			)?.label;
			if (!problemLabel) continue;

			const problemEntry = entry.problems[problemLabel];
			const problemType = problemEntry.problemType;

			// Check if submission is frozen
			const submissionTime = new Date(submission.createdAt);
			const isFrozen = !isAdmin && shouldFreeze && freezeTime && submissionTime >= freezeTime;

			if (problemType === "anigma") {
				// ANIGMA: track best score
				if (isFrozen) {
					problemEntry.isFrozen = true;
				} else {
					const currentScore = submission.score ?? 0;
					if (!problemEntry.score || currentScore > problemEntry.score) {
						problemEntry.score = currentScore;
					}
				}
			} else {
				// ICPC: track attempts and solve time
				if (isFrozen) {
					problemEntry.isFrozen = true;
				} else {
					if (!problemEntry.solved) {
						problemEntry.attempts = (problemEntry.attempts || 0) + 1;

						if (submission.verdict === "accepted") {
							problemEntry.solved = true;
							const solveTime = Math.floor(
								(submissionTime.getTime() - new Date(contest.startTime).getTime()) / 60000
							);
							problemEntry.solvedTime = solveTime;
						}
					}
				}
			}
		}

		// Calculate total score and penalty
		for (const label in entry.problems) {
			const p = entry.problems[label];

			if (p.problemType === "anigma") {
				// ANIGMA: add score directly
				entry.totalScore += p.score || 0;
			} else {
				// ICPC: add 100 points for solved, calculate penalty
				if (p.solved) {
					entry.totalScore += 100;
					entry.penalty += (p.solvedTime || 0) + (p.attempts! - 1) * contest.penaltyMinutes;
				}
			}
		}

		scoreboard.push(entry);
	}

	// Sort scoreboard: total score desc, then penalty asc
	scoreboard.sort((a, b) => {
		if (a.totalScore !== b.totalScore) {
			return b.totalScore - a.totalScore;
		}
		return a.penalty - b.penalty;
	});

	// Assign ranks
	for (let i = 0; i < scoreboard.length; i++) {
		if (i === 0) {
			scoreboard[i].rank = 1;
		} else if (
			scoreboard[i].totalScore === scoreboard[i - 1].totalScore &&
			scoreboard[i].penalty === scoreboard[i - 1].penalty
		) {
			scoreboard[i].rank = scoreboard[i - 1].rank;
		} else {
			scoreboard[i].rank = i + 1;
		}
	}

	return {
		contest,
		scoreboard,
		isFrozen: shouldFreeze && !isAdmin,
	};
}

// Get Admin Scoreboard (always unfrozen)
export async function getAdminScoreboard(contestId: number) {
	await requireAdmin();

	// Temporarily override freeze check by calling with admin session
	return getScoreboard(contestId);
}

// Unfreeze Scoreboard (set isFrozen to false)
export async function unfreezeScoreboard(contestId: number) {
	await requireAdmin();

	const [updated] = await db
		.update(contests)
		.set({
			isFrozen: false,
			updatedAt: new Date(),
		})
		.where(eq(contests.id, contestId))
		.returning();

	return updated;
}

// Get Contest Standings (simplified for display)
export async function getContestStandings(contestId: number) {
	const { scoreboard, isFrozen, contest } = await getScoreboard(contestId);

	return {
		contest: {
			id: contest.id,
			title: contest.title,
			startTime: contest.startTime,
			endTime: contest.endTime,
			isFrozen,
		},
		standings: scoreboard.map((entry) => ({
			rank: entry.rank,
			username: entry.username,
			name: entry.name,
			totalScore: entry.totalScore,
			penalty: entry.penalty,
		})),
	};
}

export type GetScoreboardReturn = Awaited<ReturnType<typeof getScoreboard>>;
export type ScoreboardEntryType = GetScoreboardReturn["scoreboard"][number];
export type GetContestStandingsReturn = Awaited<ReturnType<typeof getContestStandings>>;
