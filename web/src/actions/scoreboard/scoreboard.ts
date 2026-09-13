"use server";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	contestParticipants,
	contestProblems,
	contests,
	type ExternalSite,
	problems,
	submissions,
	testcases,
	users,
} from "@/db/schema";
import { getSessionInfo, requireAdmin } from "@/lib/auth-utils";
import { userDisplayHandle, userDisplayJoin } from "@/lib/db/user-display";
import { isContestOperator } from "@/lib/services/contest-operators";

export interface ScoreboardEntry {
	rank: number;
	userId: number;
	username: string;
	name: string;
	mainExternalSite: ExternalSite | null;
	mainExternalRating: number | null;
	totalScore: number;
	penalty: number; // in minutes
	maxSubmissionTime: number; // 최대 제출 시간 (minutes from contest start, 늦을수록 불리)
	problems: {
		[label: string]: {
			problemType: "icpc" | "special_judge" | "anigma" | "interactive" | "two_step";
			hasSubtasks?: boolean;
			useFullJudge?: boolean;
			// ICPC fields
			solved?: boolean;
			attempts?: number;
			solvedTime?: number; // minutes from contest start
			// Subtask (IOI) fields
			bestScore?: number; // max(submission.score) across non-frozen attempts
			// Full-judge fields
			bestPassed?: number; // max(submission.passedTestcases) across non-frozen attempts
			totalTestcases?: number; // total testcase count for full-judge problems
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
export async function getScoreboard(contestId: number, viewAsParticipant = false) {
	const { userId, isAdmin } = await getSessionInfo();
	const isOperator = userId ? await isContestOperator(contestId, userId) : false;
	const isStaff = isAdmin || isOperator;
	// Staff (admin/operator) can opt into the participant view (frozen masking applied)
	// via viewAsParticipant. Visibility/auth checks below still use the real isStaff so
	// private-contest access is preserved.
	const effectiveStaff = isStaff && !viewAsParticipant;

	// Get contest info
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);

	if (!contest) {
		throw new Error("Contest not found");
	}

	// Check if contest is finished
	const now = new Date();
	const isFinished = now > contest.endTime;

	// Check access for private contests (only check if contest is not finished)
	if (contest.visibility === "private" && !isStaff && !isFinished) {
		// Check if user is a participant
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

	// Check if contest is frozen.
	// During contest: freeze applies automatically once now >= freezeTime (ICPC standard).
	// After contest: postContestVisibility controls whether the freeze persists or auto-lifts.
	const contestEndTime = new Date(contest.endTime);
	const freezeTime = contest.freezeMinutes
		? new Date(contestEndTime.getTime() - contest.freezeMinutes * 60 * 1000)
		: null;
	const shouldFreeze = isFinished
		? contest.postContestVisibility === "frozen" && freezeTime !== null
		: freezeTime !== null && now >= freezeTime;

	// Get contest problems
	const contestProblemsList = await db
		.select({
			label: contestProblems.label,
			problemId: contestProblems.problemId,
			problemType: problems.problemType,
			hasSubtasks: problems.hasSubtasks,
			useFullJudge: problems.useFullJudge,
			order: contestProblems.order,
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(eq(contestProblems.contestId, contestId))
		.orderBy(contestProblems.order);

	// Build totalTestcases map for full-judge problems (used for cell display "(bestPassed/N)")
	const fullJudgeProblemIds = contestProblemsList
		.filter((p) => p.useFullJudge)
		.map((p) => p.problemId);
	let totalsByProblemId = new Map<number, number>();
	if (fullJudgeProblemIds.length > 0) {
		const totals = await db
			.select({
				problemId: testcases.problemId,
				count: sql<number>`COUNT(*)::int`,
			})
			.from(testcases)
			.where(inArray(testcases.problemId, fullJudgeProblemIds))
			.groupBy(testcases.problemId);
		totalsByProblemId = new Map(totals.map((t) => [t.problemId, t.count]));
	}

	// Get participants
	const participantsList = await db
		.select({
			userId: contestParticipants.userId,
			username: users.username,
			name: users.name,
			mainExternalSite: users.mainExternalSite,
			mainExternalRating: userDisplayHandle.rating,
		})
		.from(contestParticipants)
		.innerJoin(users, eq(contestParticipants.userId, users.id))
		.leftJoin(userDisplayJoin.table, userDisplayJoin.on)
		.where(eq(contestParticipants.contestId, contestId));

	// Get all submissions for this contest
	const submissionsList = await db
		.select({
			id: submissions.id,
			userId: submissions.userId,
			problemId: submissions.problemId,
			verdict: submissions.verdict,
			score: submissions.score,
			passedTestcases: submissions.passedTestcases,
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
			mainExternalSite: participant.mainExternalSite,
			mainExternalRating: participant.mainExternalRating,
			totalScore: 0,
			penalty: 0,
			maxSubmissionTime: 0, // 최대 제출 시간 (minutes from contest start)
			problems: {},
		};

		// Initialize problem entries
		for (const cp of contestProblemsList) {
			entry.problems[cp.label] = {
				problemType: cp.problemType,
				hasSubtasks: cp.hasSubtasks,
				useFullJudge: cp.useFullJudge,
				...(cp.useFullJudge ? { totalTestcases: totalsByProblemId.get(cp.problemId) ?? 0 } : {}),
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
			const isFrozen =
				!effectiveStaff && shouldFreeze && freezeTime && submissionTime >= freezeTime;
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
			const isFrozen =
				!effectiveStaff && shouldFreeze && freezeTime && submissionTime >= freezeTime;

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
			} else if (problemEntry.hasSubtasks) {
				// IOI-style subtask problem: track max(submission.score) across attempts; no ICPC penalty.
				// Accepted implies full max_score; partial gives 0 < score < max_score.
				if (isFrozen) {
					problemEntry.isFrozen = true;
				} else {
					const s = submission.score ?? 0;
					if (s > 0) {
						problemEntry.bestScore = Math.max(problemEntry.bestScore ?? 0, s);
						// Mark "solved" for solvedTime tracking (earliest scoring attempt wins)
						if (!problemEntry.solved) {
							problemEntry.solved = true;
							problemEntry.solvedTime = Math.floor(
								(submissionTime.getTime() - new Date(contest.startTime).getTime()) / 60000
							);
						}
					}
				}
			} else if (problemEntry.useFullJudge) {
				// Full-judge ICPC: scoring is ICPC-style, but track best passedTestcases as tiebreaker
				if (isFrozen) {
					problemEntry.isFrozen = true;
				} else {
					const passed = submission.passedTestcases ?? 0;
					problemEntry.bestPassed = Math.max(problemEntry.bestPassed ?? 0, passed);

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
			} else if (p.hasSubtasks) {
				// IOI subtask: award bestScore, no penalty
				entry.totalScore += p.bestScore || 0;
			} else {
				// ICPC (full-judge or otherwise): add 100 points for solved, calculate penalty
				if (p.solved) {
					entry.totalScore += 100;
					entry.penalty += (p.solvedTime || 0) + (p.attempts! - 1) * contest.penaltyMinutes;
				}
			}
		}

		scoreboard.push(entry);
	}

	// Sort scoreboard:
	//   1) total score desc
	//   2) penalty asc
	//   3) max submission time asc (늦을수록 불리)
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
		isFrozen: shouldFreeze && !effectiveStaff,
	};
}

// Get Admin Scoreboard (always unfrozen)
export async function getAdminScoreboard(contestId: number) {
	await requireAdmin();

	// Temporarily override freeze check by calling with admin session
	return getScoreboard(contestId);
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
