import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { submissions } from "@/db/schema";

const MAX_BONUS = 20;
const K = 1.5;

/**
 * Recalculate contest bonus for all accepted submissions in a contest
 * Called when a new accepted submission is made for an ANIGMA problem in a contest
 *
 * IMPORTANT: Only considers the BEST submission per user (highest score, then shortest edit distance)
 */
export async function recalculateContestBonus(contestId: number, problemId: number) {
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

	// 2. For each user, select the BEST submission:
	//    - Highest score first
	//    - If tied, shortest edit distance
	//    - If still tied, earliest submission
	const bestSubmissionsByUser = new Map<number, (typeof allAcceptedSubmissions)[0]>();

	for (const sub of allAcceptedSubmissions) {
		const existing = bestSubmissionsByUser.get(sub.userId);

		if (!existing) {
			bestSubmissionsByUser.set(sub.userId, sub);
			continue;
		}

		// Compare: higher score wins
		if (sub.score! > existing.score!) {
			bestSubmissionsByUser.set(sub.userId, sub);
		} else if (sub.score === existing.score) {
			// Same score: shorter edit distance wins
			if (sub.editDistance! < existing.editDistance!) {
				bestSubmissionsByUser.set(sub.userId, sub);
			} else if (sub.editDistance === existing.editDistance) {
				// Same score, same edit distance: earlier submission wins
				if (sub.createdAt < existing.createdAt) {
					bestSubmissionsByUser.set(sub.userId, sub);
				}
			}
		}
	}

	const bestSubmissions = Array.from(bestSubmissionsByUser.values());

	if (bestSubmissions.length === 0) return;

	// 3. Calculate R_max and R_min from BEST submissions only
	const distances = bestSubmissions.map((s) => s.editDistance!);
	const R_max = Math.max(...distances);
	const R_min = Math.min(...distances);

	// 4. Calculate bonus for each user's BEST submission and update
	for (const sub of bestSubmissions) {
		let bonus = 0;

		if (R_max === R_min) {
			// All participants have same edit distance, give max bonus to all
			bonus = MAX_BONUS;
		} else {
			const ratio = (R_max - sub.editDistance!) / (R_max - R_min);
			bonus = Math.floor(MAX_BONUS * ratio ** K);
		}

		// Task 2 (ZIP submission): base score is 50 for contest
		const baseScore = 50;

		// Calculate new total score: base + bonus
		const newScore = baseScore + bonus;

		// Update the BEST submission for this user
		await db
			.update(submissions)
			.set({
				score: newScore,
			})
			.where(eq(submissions.id, sub.id));
	}

	console.log(
		`[Bonus] Recalculated for contest ${contestId}, problem ${problemId}: ${bestSubmissions.length} users, R_min=${R_min}, R_max=${R_max}`
	);
}

/**
 * Calculate bonus score for a single submission
 * Used during initial scoring
 */
export function calculateBonusScore(editDistance: number, allEditDistances: number[]): number {
	if (allEditDistances.length === 0) return 0;

	const R_max = Math.max(...allEditDistances);
	const R_min = Math.min(...allEditDistances);

	if (R_max === R_min) {
		return MAX_BONUS;
	}

	const ratio = (R_max - editDistance) / (R_max - R_min);
	return Math.floor(MAX_BONUS * ratio ** K);
}
