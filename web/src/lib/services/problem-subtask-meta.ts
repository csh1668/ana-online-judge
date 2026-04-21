import { eq } from "drizzle-orm";
import { db } from "@/db";
import { problems, testcases } from "@/db/schema";

/**
 * Recompute `problems.has_subtasks` (distinct subtask_group > 1) and, for
 * subtask problems, overwrite `problems.max_score` with Σ tc.score. Call
 * this after any testcase create/update/delete/bulk-upload/publish.
 *
 * For non-subtask problems, max_score is NOT touched — it stays at the
 * operator-configured value (default 100).
 */
export async function recomputeProblemSubtaskMeta(problemId: number): Promise<void> {
	const rows = await db
		.select({
			subtaskGroup: testcases.subtaskGroup,
			score: testcases.score,
		})
		.from(testcases)
		.where(eq(testcases.problemId, problemId));

	const groups = new Set<number>();
	let totalScore = 0;
	for (const r of rows) {
		groups.add(r.subtaskGroup ?? 0);
		totalScore += r.score ?? 0;
	}
	const hasSubtasks = groups.size > 1;

	if (hasSubtasks) {
		await db
			.update(problems)
			.set({ hasSubtasks: true, maxScore: totalScore })
			.where(eq(problems.id, problemId));
	} else {
		await db.update(problems).set({ hasSubtasks: false }).where(eq(problems.id, problemId));
	}
}
