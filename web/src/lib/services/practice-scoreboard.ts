import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { ScoreboardEntry } from "@/actions/scoreboard";
import { db } from "@/db";
import { practiceProblems, practices, problems, submissions, testcases, users } from "@/db/schema";
import { userDisplayHandle, userDisplayJoin } from "@/lib/db/user-display";

export async function getPracticeScoreboard(practiceId: number): Promise<{
	practice: {
		id: number;
		title: string;
		description: string | null;
		createdBy: number;
		startTime: Date;
		endTime: Date;
		penaltyMinutes: number;
		createdAt: Date;
		updatedAt: Date;
	};
	problems: {
		label: string;
		problemId: number;
		problemType: "icpc" | "special_judge" | "anigma" | "interactive";
		hasSubtasks: boolean;
		order: number;
	}[];
	scoreboard: ScoreboardEntry[];
}> {
	const [practice] = await db.select().from(practices).where(eq(practices.id, practiceId)).limit(1);
	if (!practice) throw new Error("연습을 찾을 수 없습니다");

	const effectiveStart =
		practice.startTime > practice.createdAt ? practice.startTime : practice.createdAt;

	const practiceProblemsList = await db
		.select({
			label: practiceProblems.label,
			problemId: practiceProblems.problemId,
			problemType: problems.problemType,
			hasSubtasks: problems.hasSubtasks,
			useFullJudge: problems.useFullJudge,
			order: practiceProblems.order,
		})
		.from(practiceProblems)
		.innerJoin(problems, eq(practiceProblems.problemId, problems.id))
		.where(eq(practiceProblems.practiceId, practiceId))
		.orderBy(asc(practiceProblems.order));

	if (practiceProblemsList.length === 0) {
		return {
			practice,
			problems: [],
			scoreboard: [],
		};
	}

	// Build totalTestcases map for full-judge problems (used for cell display "(bestPassed/N)")
	const fullJudgeProblemIds = practiceProblemsList
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

	const problemIds = practiceProblemsList.map((p) => p.problemId);
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
				inArray(submissions.problemId, problemIds),
				gte(submissions.createdAt, effectiveStart),
				lte(submissions.createdAt, practice.endTime)
			)
		)
		.orderBy(submissions.createdAt);

	const participantIds = Array.from(new Set(submissionsList.map((s) => s.userId)));
	if (participantIds.length === 0) {
		return { practice, problems: practiceProblemsList, scoreboard: [] };
	}
	const participantsList = await db
		.select({
			userId: users.id,
			username: users.username,
			name: users.name,
			mainExternalSite: users.mainExternalSite,
			mainExternalRating: userDisplayHandle.rating,
		})
		.from(users)
		.leftJoin(userDisplayJoin.table, userDisplayJoin.on)
		.where(inArray(users.id, participantIds));

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
			maxSubmissionTime: 0,
			problems: {},
		};
		for (const cp of practiceProblemsList) {
			entry.problems[cp.label] = {
				problemType: cp.problemType,
				hasSubtasks: cp.hasSubtasks,
				useFullJudge: cp.useFullJudge,
				...(cp.useFullJudge ? { totalTestcases: totalsByProblemId.get(cp.problemId) ?? 0 } : {}),
			};
		}

		const anigmaTaskScores = new Map<
			number,
			{ task1?: (typeof submissionsList)[number]; task2?: (typeof submissionsList)[number] }
		>();
		for (const submission of submissionsList) {
			if (submission.userId !== participant.userId) continue;
			if (!submission.anigmaTaskType) continue;
			if (submission.verdict !== "accepted") continue;
			const cp = practiceProblemsList.find((p) => p.problemId === submission.problemId);
			if (cp?.problemType !== "anigma") continue;
			let taskMap = anigmaTaskScores.get(submission.problemId);
			if (!taskMap) {
				taskMap = {};
				anigmaTaskScores.set(submission.problemId, taskMap);
			}
			if (submission.anigmaTaskType === 1) {
				if (
					!taskMap.task1 ||
					(submission.score ?? 0) > (taskMap.task1.score ?? 0) ||
					(submission.score === taskMap.task1.score &&
						submission.createdAt < taskMap.task1.createdAt)
				) {
					taskMap.task1 = submission;
				}
			} else if (submission.anigmaTaskType === 2) {
				if (
					!taskMap.task2 ||
					(submission.score ?? 0) > (taskMap.task2.score ?? 0) ||
					(submission.score === taskMap.task2.score &&
						submission.createdAt < taskMap.task2.createdAt)
				) {
					taskMap.task2 = submission;
				}
			}
		}

		for (const submission of submissionsList) {
			if (submission.userId !== participant.userId) continue;
			const cp = practiceProblemsList.find((p) => p.problemId === submission.problemId);
			if (!cp) continue;
			const entryProblem = entry.problems[cp.label];
			const submissionTime = new Date(submission.createdAt);
			const submissionTimeMinutes = Math.floor(
				(submissionTime.getTime() - effectiveStart.getTime()) / 60000
			);
			entry.maxSubmissionTime = Math.max(entry.maxSubmissionTime, submissionTimeMinutes);

			if (cp.problemType === "anigma") {
				const taskMap = anigmaTaskScores.get(submission.problemId);
				if (taskMap) {
					const task1 = taskMap.task1;
					const task2 = taskMap.task2;
					const task1Score = task1?.score ?? 0;
					const task2Score = task2?.score ?? 0;
					entryProblem.score = task1Score + task2Score;
					entryProblem.anigmaDetails = {
						task1Score,
						task2Score,
						editDistance: task2?.editDistance ?? null,
						bestSubmissionId: task2?.id ?? task1?.id ?? 0,
					};
					const earliest = [task1, task2]
						.filter((s): s is NonNullable<typeof s> => !!s)
						.map((s) => new Date(s.createdAt).getTime())
						.sort()[0];
					if (earliest !== undefined) {
						entryProblem.solvedTime = Math.floor((earliest - effectiveStart.getTime()) / 60000);
					}
				}
			} else if (cp.hasSubtasks) {
				const s = submission.score ?? 0;
				if (s > 0) {
					entryProblem.bestScore = Math.max(entryProblem.bestScore ?? 0, s);
					if (!entryProblem.solved) {
						entryProblem.solved = true;
						entryProblem.solvedTime = submissionTimeMinutes;
					}
				}
			} else if (cp.useFullJudge) {
				// Full-judge ICPC: scoring is ICPC-style, but track best passedTestcases as tiebreaker
				const passed = submission.passedTestcases ?? 0;
				entryProblem.bestPassed = Math.max(entryProblem.bestPassed ?? 0, passed);

				if (!entryProblem.solved) {
					entryProblem.attempts = (entryProblem.attempts || 0) + 1;
					if (submission.verdict === "accepted") {
						entryProblem.solved = true;
						entryProblem.solvedTime = submissionTimeMinutes;
					}
				}
			} else {
				if (!entryProblem.solved) {
					entryProblem.attempts = (entryProblem.attempts || 0) + 1;
					if (submission.verdict === "accepted") {
						entryProblem.solved = true;
						entryProblem.solvedTime = submissionTimeMinutes;
					}
				}
			}
		}

		for (const label in entry.problems) {
			const p = entry.problems[label];
			if (p.problemType === "anigma") {
				entry.totalScore += p.score ?? 0;
			} else if (p.hasSubtasks) {
				entry.totalScore += p.bestScore ?? 0;
			} else if (p.solved) {
				entry.totalScore += 100;
				entry.penalty += (p.solvedTime ?? 0) + ((p.attempts ?? 1) - 1) * practice.penaltyMinutes;
			}
		}

		scoreboard.push(entry);
	}

	scoreboard.sort((a, b) => {
		if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
		if (a.penalty !== b.penalty) return a.penalty - b.penalty;
		return a.maxSubmissionTime - b.maxSubmissionTime;
	});
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

	return { practice, problems: practiceProblemsList, scoreboard };
}

export type GetPracticeScoreboardReturn = Awaited<ReturnType<typeof getPracticeScoreboard>>;
