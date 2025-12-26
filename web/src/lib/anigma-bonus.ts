import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { submissions } from "@/db/schema";

const MAX_BONUS = 20;
const K = 1.5;

/**
 * Recalculate contest bonus for all accepted submissions in a contest
 * Called when a new accepted submission is made for an ANIGMA problem in a contest
 */
export async function recalculateContestBonus(contestId: number, problemId: number) {
	// 1. Get all accepted submissions for this problem in this contest with edit distance
	const acceptedSubmissions = await db
		.select({
			id: submissions.id,
			userId: submissions.userId,
			score: submissions.score,
			editDistance: submissions.editDistance,
		})
		.from(submissions)
		.where(
			and(
				eq(submissions.contestId, contestId),
				eq(submissions.problemId, problemId),
				eq(submissions.verdict, "accepted"),
				isNotNull(submissions.editDistance)
			)
		);

	if (acceptedSubmissions.length === 0) return;

	// 2. Calculate R_max and R_min
	const distances = acceptedSubmissions.map((s) => s.editDistance!);
	const R_max = Math.max(...distances);
	const R_min = Math.min(...distances);

	// 3. Calculate bonus for each submission and update
	for (const sub of acceptedSubmissions) {
		let bonus = 0;

		if (R_max === R_min) {
			// All participants have same edit distance, give max bonus to all
			bonus = MAX_BONUS;
		} else {
			const ratio = (R_max - sub.editDistance!) / (R_max - R_min);
			bonus = Math.floor(MAX_BONUS * ratio ** K);
		}

		// Calculate base score from submission data
		// Judge worker stores base scores: Task1=30, Task2=50 (for contest) or 70 (non-contest)
		// We need to recalculate total score as: baseScore + bonus
		const [currentSub] = await db
			.select({
				anigmaTaskType: submissions.anigmaTaskType,
			})
			.from(submissions)
			.where(eq(submissions.id, sub.id))
			.limit(1);

		if (!currentSub) continue;

		// Calculate base score for contest ANIGMA problems
		// Since we filtered by verdict='accepted', all submissions are correct
		let baseScore = 0;

		if (currentSub.anigmaTaskType === 1) {
			// Task 1 (differential testing): 30 points for accepted
			baseScore = 30;
		} else if (currentSub.anigmaTaskType === 2) {
			// Task 2 (ZIP submission): 50 points for contest accepted
			baseScore = 50;
		}

		// Calculate new total score: base + bonus
		const newScore = baseScore + bonus;

		// Update submission
		await db
			.update(submissions)
			.set({
				score: newScore,
			})
			.where(eq(submissions.id, sub.id));
	}
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
