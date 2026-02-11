"use server";

import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	contestParticipants,
	contestProblems,
	problems,
	submissionResults,
	submissions,
	users,
} from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";

export async function getSubmissions(options?: {
	page?: number;
	limit?: number;
	userId?: number;
	problemId?: number;
	contestId?: number;
	excludeContestSubmissions?: boolean;
}) {
	const { userId: currentUserId, isAdmin } = await getSessionInfo();

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const conditions = [];
	if (options?.userId) {
		conditions.push(eq(submissions.userId, options.userId));
	}
	if (options?.problemId) {
		conditions.push(eq(submissions.problemId, options.problemId));
	}
	if (options?.contestId) {
		conditions.push(eq(submissions.contestId, options.contestId));
	}

	// If excludeContestSubmissions is true and user is not admin, filter at DB level
	if (!isAdmin && options?.excludeContestSubmissions && currentUserId) {
		// Show: own submissions OR non-contest public submissions
		conditions.push(
			or(
				eq(submissions.userId, currentUserId),
				and(isNull(submissions.contestId), eq(problems.isPublic, true))
			)
		);
	}

	const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

	// If excludeContestSubmissions is true, DB already filtered - skip memory filtering
	const alreadyFiltered = !isAdmin && options?.excludeContestSubmissions && currentUserId;

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
			.orderBy(desc(submissions.createdAt))
			.limit(limit)
			.offset(offset),
		db
			.select({ count: count() })
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.leftJoin(
				contestProblems,
				and(
					eq(contestProblems.contestId, submissions.contestId),
					eq(contestProblems.problemId, submissions.problemId)
				)
			)
			.where(whereCondition),
	]);

	// If already filtered at DB level (excludeContestSubmissions) or admin, return directly
	if (alreadyFiltered || isAdmin) {
		return {
			submissions: submissionsList,
			total: totalResult[0].count,
		};
	}

	// Filter submissions based on problem visibility for non-admin users
	// Get contest IDs that the user is participating in
	const accessibleContestIds = currentUserId
		? await db
				.select({ contestId: contestParticipants.contestId })
				.from(contestParticipants)
				.where(eq(contestParticipants.userId, currentUserId))
				.then((rows) => rows.map((r) => r.contestId))
		: [];

	// Filter: public problems OR user's own submissions OR submissions from contests user is participating in
	const filteredSubmissions = submissionsList.filter((sub) => {
		// Own submissions - always visible
		if (currentUserId && sub.userId === currentUserId) return true;

		// Non-contest public submissions - everyone can see
		if (sub.contestId === null && sub.problemIsPublic) return true;

		// Contest submissions - only if user is participating in that contest
		if (sub.contestId !== null && accessibleContestIds.includes(sub.contestId)) return true;

		return false;
	});

	return {
		submissions: filteredSubmissions,
		total: filteredSubmissions.length, // Note: This is page-level count, not accurate total
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
