import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { problems, submissions } from "@/db/schema";

// ANIGMA 점수 상수 정의 (총 100점 만점)
export const ANIGMA_TASK1_SCORE = 30; // Task 1 점수
export const ANIGMA_TASK2_BASE_SCORE = 50; // Task 2 기본 점수
export const ANIGMA_TASK2_BONUS = 20; // Task 2 보너스 최대값 (0~20점, 수식에 따라 계산)
export const ANIGMA_MAX_SCORE = 100; // 총 만점 (Task1 30 + Task2 70)

const K = 1.5;

/**
 * Recalculate contest bonus for all accepted submissions in a contest
 * Called when a new accepted submission is made for an ANIGMA problem in a contest
 *
 * IMPORTANT: R_max and R_min are calculated from BEST submissions per user (shortest edit_distance)
 * But all accepted submissions are updated with their respective bonus scores
 */
export async function recalculateContestBonus(contestId: number, problemId: number) {
	// 0. Check if problem exists (maxScore is always 100 for ANIGMA)
	const [problem] = await db
		.select({
			id: problems.id,
		})
		.from(problems)
		.where(eq(problems.id, problemId));

	if (!problem) {
		console.error(`Problem not found: ${problemId}`);
		return;
	}

	// 1. Get all accepted Task2 submissions for this problem in this contest with edit distance
	const allAcceptedSubmissions = await db
		.select({
			id: submissions.id,
			userId: submissions.userId,
			score: submissions.score,
			editDistance: submissions.editDistance,
			anigmaTaskType: submissions.anigmaTaskType,
			createdAt: submissions.createdAt,
		})
		.from(submissions)
		.where(
			and(
				eq(submissions.contestId, contestId),
				eq(submissions.problemId, problemId),
				eq(submissions.verdict, "accepted"),
				eq(submissions.anigmaTaskType, 2), // Task 2 only (ZIP submissions have edit distance)
				isNotNull(submissions.editDistance)
			)
		)
		.orderBy(submissions.createdAt); // For consistent ordering

	if (allAcceptedSubmissions.length === 0) return;

	// 2. For each user, select the BEST submission by edit_distance (shortest first, then earliest)
	const bestSubmissionsByUser = new Map<number, (typeof allAcceptedSubmissions)[0]>();

	for (const sub of allAcceptedSubmissions) {
		const existing = bestSubmissionsByUser.get(sub.userId);

		if (!existing) {
			bestSubmissionsByUser.set(sub.userId, sub);
			continue;
		}

		// Compare: shorter edit distance wins
		if (sub.editDistance! < existing.editDistance!) {
			bestSubmissionsByUser.set(sub.userId, sub);
		} else if (sub.editDistance === existing.editDistance) {
			// Same edit distance: earlier submission wins
			if (sub.createdAt < existing.createdAt) {
				bestSubmissionsByUser.set(sub.userId, sub);
			}
		}
	}

	const bestSubmissions = Array.from(bestSubmissionsByUser.values());

	if (bestSubmissions.length === 0) return;

	// 3. Calculate R_max and R_min from BEST submissions only
	const distances = bestSubmissions.map((s) => s.editDistance!);
	const R_max = Math.max(...distances);
	const R_min = Math.min(...distances);

	// 4. Calculate bonus for all accepted submissions
	// Only update submissions where the score actually changes to reduce overhead
	// Task 2 점수 = 기본 50점 + 보너스 (0~20점, 수식에 따라 계산)
	const baseScore = ANIGMA_TASK2_BASE_SCORE;
	const updates: Array<{ id: number; score: number }> = [];

	for (const sub of allAcceptedSubmissions) {
		let bonus = 0;

		if (R_max === R_min) {
			// All participants have same edit distance, give max bonus to all
			bonus = ANIGMA_TASK2_BONUS;
		} else {
			const ratio = (R_max - sub.editDistance!) / (R_max - R_min);
			bonus = Math.floor(ANIGMA_TASK2_BONUS * ratio ** K);
		}

		// Calculate new total score: base + bonus
		const newScore = baseScore + bonus;
		const currentScore = sub.score ?? 0;

		// Only update if score has changed
		if (newScore !== currentScore) {
			updates.push({ id: sub.id, score: newScore });
		}
	}

	// Batch update only changed submissions in a transaction for atomicity (all or nothing)
	// If any update fails, all changes are rolled back
	if (updates.length > 0) {
		await db.transaction(async (tx) => {
			for (const update of updates) {
				await tx
					.update(submissions)
					.set({
						score: update.score,
					})
					.where(eq(submissions.id, update.id));
			}
		});
	}
}

/**
 * Calculate bonus score for a single submission
 * Used during initial scoring
 * Returns bonus score from 0 to ANIGMA_TASK2_BONUS (20) based on edit distance
 */
export function calculateBonusScore(editDistance: number, allEditDistances: number[]): number {
	if (allEditDistances.length === 0) return 0;

	const R_max = Math.max(...allEditDistances);
	const R_min = Math.min(...allEditDistances);

	if (R_max === R_min) {
		return ANIGMA_TASK2_BONUS;
	}

	const ratio = (R_max - editDistance) / (R_max - R_min);
	return Math.floor(ANIGMA_TASK2_BONUS * ratio ** K);
}
