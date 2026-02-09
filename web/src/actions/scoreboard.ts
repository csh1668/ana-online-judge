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

	// Check if contest is finished (scoreboard is public after endTime)
	const now = new Date();
	const isFinished = now > contest.endTime;

	// Check access for private contests (only check if contest is not finished)
	if (contest.visibility === "private" && !isAdmin && !isFinished) {
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

interface ScoreboardEntry {
	rank: number;
	userId: number;
	username: string;
	name: string;
	totalScore: number;
	penalty: number; // in minutes
	maxSubmissionTime: number; // 최대 제출 시간 (minutes from contest start, 늦을수록 불리)
	problems: {
		[label: string]: {
			problemType: "icpc" | "special_judge" | "anigma";
			// ICPC fields
			solved?: boolean;
			attempts?: number;
			solvedTime?: number; // minutes from contest start
			// ANIGMA fields
			score?: number;
			anigmaDetails?: {
				task1Score: number; // Task 1 점수 (0 or 30)
				task2Score: number; // Task 2 점수 (0 or 50/70)
				editDistance: number | null; // 편집 거리
				bestSubmissionId: number; // 최고 점수 제출 ID
			};
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

	// Check if contest is finished
	const now = new Date();
	const isFinished = now > contest.endTime;

	// Check access for private contests (only check if contest is not finished)
	if (contest.visibility === "private" && !isAdmin && !isFinished) {
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
			maxSubmissionTime: 0, // 최대 제출 시간 (minutes from contest start)
			problems: {},
		};

		// Initialize problem entries
		for (const cp of contestProblemsList) {
			entry.problems[cp.label] = {
				problemType: cp.problemType,
			};
		}

		// Track ANIGMA task scores separately (problemId -> { task1, task2 })
		const anigmaTaskScores = new Map<
			number,
			{ task1?: (typeof submissionsList)[0]; task2?: (typeof submissionsList)[0] }
		>();

		// First pass: collect ANIGMA task submissions
		for (const submission of submissionsList) {
			if (submission.userId !== participant.userId) continue;
			if (!submission.anigmaTaskType) continue; // Not an ANIGMA submission
			if (submission.verdict !== "accepted") continue; // Only accepted submissions

			const problemLabel = contestProblemsList.find(
				(p) => p.problemId === submission.problemId
			)?.label;
			if (!problemLabel) continue;

			const problemEntry = entry.problems[problemLabel];
			if (problemEntry.problemType !== "anigma") continue;

			const submissionTime = new Date(submission.createdAt);
			const isFrozen = !isAdmin && shouldFreeze && freezeTime && submissionTime >= freezeTime;
			if (isFrozen) continue; // Skip frozen submissions for now

			// Get or create task map for this problem
			let taskMap = anigmaTaskScores.get(submission.problemId);
			if (!taskMap) {
				taskMap = {};
				anigmaTaskScores.set(submission.problemId, taskMap);
			}

			if (submission.anigmaTaskType === 1) {
				// Task 1: keep best (highest score, then earliest)
				if (
					!taskMap.task1 ||
					submission.score! > taskMap.task1.score! ||
					(submission.score === taskMap.task1.score &&
						submission.createdAt < taskMap.task1.createdAt)
				) {
					taskMap.task1 = submission;
				}
			} else if (submission.anigmaTaskType === 2) {
				// Task 2: keep best (highest score, then earliest)
				if (
					!taskMap.task2 ||
					submission.score! > taskMap.task2.score! ||
					(submission.score === taskMap.task2.score &&
						submission.createdAt < taskMap.task2.createdAt)
				) {
					taskMap.task2 = submission;
				}
			}
		}

		// Second pass: process all submissions for display and track max submission time
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

			// Track max submission time (only for non-frozen submissions)
			if (!isFrozen) {
				const submissionTimeMinutes = Math.floor(
					(submissionTime.getTime() - new Date(contest.startTime).getTime()) / 60000
				);
				entry.maxSubmissionTime = Math.max(entry.maxSubmissionTime, submissionTimeMinutes);
			}

			if (problemType === "anigma") {
				// ANIGMA: use pre-calculated best submissions
				if (isFrozen) {
					problemEntry.isFrozen = true;
				} else {
					const taskMap = anigmaTaskScores.get(submission.problemId);
					if (taskMap) {
						const task1 = taskMap.task1;
						const task2 = taskMap.task2;

						const task1Score = task1?.score ?? 0;
						const task2Score = task2?.score ?? 0;
						const totalScore = task1Score + task2Score;

						// Set the combined score
						problemEntry.score = totalScore;

						// Set ANIGMA details
						problemEntry.anigmaDetails = {
							task1Score,
							task2Score,
							editDistance: task2?.editDistance ?? null,
							bestSubmissionId: task2?.id ?? task1?.id ?? 0,
						};

						// Store earliest submission time
						const earliestTime = [task1, task2]
							.filter((s) => s)
							.map((s) => new Date(s!.createdAt).getTime())
							.sort()[0];

						if (earliestTime) {
							problemEntry.solvedTime = Math.floor(
								(earliestTime - new Date(contest.startTime).getTime()) / 60000
							);
						}
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

	// Sort scoreboard: total score desc, then penalty asc, then max submission time asc (늦을수록 불리)
	scoreboard.sort((a, b) => {
		if (a.totalScore !== b.totalScore) {
			return b.totalScore - a.totalScore;
		}
		if (a.penalty !== b.penalty) {
			return a.penalty - b.penalty;
		}
		// 총점과 페널티가 같으면 최대 제출 시간이 작은 것(빠른 것)이 우선
		return a.maxSubmissionTime - b.maxSubmissionTime;
	});

	// Assign ranks
	for (let i = 0; i < scoreboard.length; i++) {
		if (i === 0) {
			scoreboard[i].rank = 1;
		} else if (
			scoreboard[i].totalScore === scoreboard[i - 1].totalScore &&
			scoreboard[i].penalty === scoreboard[i - 1].penalty &&
			scoreboard[i].maxSubmissionTime === scoreboard[i - 1].maxSubmissionTime
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
