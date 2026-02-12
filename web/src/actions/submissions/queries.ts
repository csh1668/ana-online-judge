"use server";

import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
	contestParticipants,
	contestProblems,
	type Language,
	problems,
	submissionResults,
	submissions,
	users,
	type Verdict,
} from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";

export async function getSubmissions(options?: {
	page?: number;
	limit?: number;
	userId?: number;
	problemId?: number;
	contestId?: number;
	excludeContestSubmissions?: boolean;
	username?: string;
	verdict?: string;
	language?: string;
	sort?: "id" | "executionTime" | "memoryUsed" | "createdAt";
	order?: "asc" | "desc";
}) {
	const { userId: currentUserId, isAdmin } = await getSessionInfo();

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const sort = options?.sort ?? "createdAt";
	const order = options?.order ?? "desc";

	const conditions = [];

	// 1. Basic Filters
	if (options?.userId) {
		conditions.push(eq(submissions.userId, options.userId));
	}
	if (options?.problemId) {
		conditions.push(eq(submissions.problemId, options.problemId));
	}
	if (options?.contestId) {
		conditions.push(eq(submissions.contestId, options.contestId));
	}
	if (options?.username) {
		conditions.push(sql`${users.name} ILIKE ${`%${options.username}%`}`);
	}
	if (options?.verdict && options.verdict !== "all") {
		conditions.push(eq(submissions.verdict, options.verdict as Verdict));
	}
	if (options?.language && options.language !== "all") {
		conditions.push(eq(submissions.language, options.language as Language));
	}

	// 2. Visibility Filters
	if (!isAdmin) {
		if (options?.excludeContestSubmissions) {
			if (currentUserId) {
				// Show: own submissions OR non-contest public submissions
				// (Used when viewing the general submission list)
				conditions.push(
					or(
						eq(submissions.userId, currentUserId),
						and(isNull(submissions.contestId), eq(problems.isPublic, true))
					)
				);
			} else {
				// Guest: only non-contest public submissions
				conditions.push(and(isNull(submissions.contestId), eq(problems.isPublic, true)));
			}
		} else {
			// Include contest submissions (if accessible)
			if (currentUserId) {
				// Get accessible contests
				const accessibleContestIds = await db
					.select({ contestId: contestParticipants.contestId })
					.from(contestParticipants)
					.where(eq(contestParticipants.userId, currentUserId))
					.then((rows) => rows.map((r) => r.contestId));

				const visibilityConditions = [
					// Own submissions - always visible
					eq(submissions.userId, currentUserId),
					// Non-contest public submissions - everyone can see
					and(isNull(submissions.contestId), eq(problems.isPublic, true)),
				];

				if (accessibleContestIds.length > 0) {
					// Contest submissions - only if user is participating in that contest
					visibilityConditions.push(
						and(
							isNotNull(submissions.contestId),
							inArray(submissions.contestId, accessibleContestIds)
						)
					);
				}

				conditions.push(or(...visibilityConditions));
			} else {
				// Guest: only non-contest public submissions
				conditions.push(and(isNull(submissions.contestId), eq(problems.isPublic, true)));
			}
		}
	}

	const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

	// 3. Sorting
	let orderBy: SQL | undefined;
	switch (sort) {
		case "executionTime":
			orderBy = order === "asc" ? asc(submissions.executionTime) : desc(submissions.executionTime);
			break;
		case "memoryUsed":
			orderBy = order === "asc" ? asc(submissions.memoryUsed) : desc(submissions.memoryUsed);
			break;
		case "id":
			orderBy = order === "asc" ? asc(submissions.id) : desc(submissions.id);
			break;
		default:
			orderBy = order === "asc" ? asc(submissions.createdAt) : desc(submissions.createdAt);
			break;
	}

	const [submissionsList, totalResult] = await Promise.all([
		db
			.select({
				id: submissions.id,
				problemId: submissions.problemId,
				problemTitle: problems.title,
				problemIsPublic: problems.isPublic,
				maxScore: problems.maxScore,
				userId: submissions.userId,
				userName: users.name,
				language: submissions.language,
				verdict: submissions.verdict,
				executionTime: submissions.executionTime,
				memoryUsed: submissions.memoryUsed,
				score: submissions.score,
				createdAt: submissions.createdAt,
				anigmaTaskType: submissions.anigmaTaskType,
				contestId: submissions.contestId,
				contestProblemLabel: contestProblems.label,
			})
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.innerJoin(users, eq(submissions.userId, users.id))
			.leftJoin(
				contestProblems,
				and(
					eq(contestProblems.contestId, submissions.contestId),
					eq(contestProblems.problemId, submissions.problemId)
				)
			)
			.where(whereCondition)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset),
		db
			.select({ count: count() })
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.innerJoin(users, eq(submissions.userId, users.id)) // Need join for username filter
			.leftJoin(
				contestProblems,
				and(
					eq(contestProblems.contestId, submissions.contestId),
					eq(contestProblems.problemId, submissions.problemId)
				)
			)
			.where(whereCondition),
	]);

	return {
		submissions: submissionsList,
		total: totalResult[0].count,
	};
}

export async function getSubmissionById(id: number) {
	const { userId: currentUserId, isAdmin } = await getSessionInfo();

	const result = await db
		.select({
			id: submissions.id,
			problemId: submissions.problemId,
			problemTitle: problems.title,
			problemType: problems.problemType,
			problemIsPublic: problems.isPublic,
			maxScore: problems.maxScore,
			userId: submissions.userId,
			userName: users.name,
			code: submissions.code,
			language: submissions.language,
			verdict: submissions.verdict,
			executionTime: submissions.executionTime,
			memoryUsed: submissions.memoryUsed,
			errorMessage: submissions.errorMessage,
			score: submissions.score,
			editDistance: submissions.editDistance,
			createdAt: submissions.createdAt,
			anigmaTaskType: submissions.anigmaTaskType,
			anigmaInputPath: submissions.anigmaInputPath,
			zipPath: submissions.zipPath,
			contestId: submissions.contestId,
			contestProblemLabel: contestProblems.label,
		})
		.from(submissions)
		.innerJoin(problems, eq(submissions.problemId, problems.id))
		.innerJoin(users, eq(submissions.userId, users.id))
		.leftJoin(
			contestProblems,
			and(
				eq(contestProblems.contestId, submissions.contestId),
				eq(contestProblems.problemId, submissions.problemId)
			)
		)
		.where(eq(submissions.id, id))
		.limit(1);

	if (result.length === 0) return null;

	const submission = result[0];

	// Check access permissions: Only admin and submission owner can view
	if (!isAdmin) {
		// Only own submissions are accessible
		if (!currentUserId || submission.userId !== currentUserId) {
			return null; // Access denied
		}
	}

	// Get testcase results
	const tcResults = await db
		.select()
		.from(submissionResults)
		.where(eq(submissionResults.submissionId, id))
		.orderBy(submissionResults.testcaseId);

	return {
		...submission,
		testcaseResults: tcResults,
	};
}

// Get user's best submission status for multiple problems
export async function getUserProblemStatuses(
	problemIds: number[],
	userId: number,
	contestId?: number
) {
	if (problemIds.length === 0) {
		return new Map<number, { solved: boolean; score: number | null }>();
	}

	const conditions = [
		eq(submissions.userId, userId),
		eq(submissions.verdict, "accepted"),
		sql`${submissions.problemId} IN ${problemIds}`,
	];

	if (contestId) {
		conditions.push(eq(submissions.contestId, contestId));
	}

	// Get all accepted submissions
	const userSubmissions = await db
		.select({
			problemId: submissions.problemId,
			score: submissions.score,
			problemType: problems.problemType,
			anigmaTaskType: submissions.anigmaTaskType,
		})
		.from(submissions)
		.innerJoin(problems, eq(submissions.problemId, problems.id))
		.where(and(...conditions));

	// For ANIGMA problems, calculate total score from Task 1 + Task 2
	const anigmaScores = new Map<number, { task1: number; task2: number }>();
	const nonAnigmaScores = new Map<number, number | null>();

	for (const sub of userSubmissions) {
		if (sub.problemType === "anigma") {
			const existing = anigmaScores.get(sub.problemId) ?? { task1: 0, task2: 0 };
			const score = sub.score ?? 0;

			if (sub.anigmaTaskType === 1) {
				// Task 1
				anigmaScores.set(sub.problemId, {
					...existing,
					task1: Math.max(existing.task1, score),
				});
			} else if (sub.anigmaTaskType === 2) {
				// Task 2
				anigmaScores.set(sub.problemId, {
					...existing,
					task2: Math.max(existing.task2, score),
				});
			}
		} else {
			// For non-ANIGMA, just track if solved (score doesn't matter for display)
			nonAnigmaScores.set(sub.problemId, sub.score);
		}
	}

	// Build final status map
	const statusMap = new Map<number, { solved: boolean; score: number | null }>();

	// Add ANIGMA scores (Task 1 + Task 2)
	for (const [problemId, scores] of anigmaScores.entries()) {
		const totalScore = scores.task1 + scores.task2;
		statusMap.set(problemId, {
			solved: totalScore > 0,
			score: totalScore,
		});
	}

	// Add non-ANIGMA scores
	for (const [problemId, _score] of nonAnigmaScores.entries()) {
		statusMap.set(problemId, {
			solved: true,
			score: null, // Don't show score for non-ANIGMA
		});
	}

	return statusMap;
}

export type GetSubmissionsReturn = Awaited<ReturnType<typeof getSubmissions>>;
export type SubmissionListItem = GetSubmissionsReturn["submissions"][number];
export type GetSubmissionByIdReturn = Awaited<ReturnType<typeof getSubmissionById>>;
export type SubmissionDetail = NonNullable<GetSubmissionByIdReturn>;
