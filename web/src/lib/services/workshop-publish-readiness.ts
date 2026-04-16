import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	workshopDrafts,
	workshopInvocations,
	workshopProblems,
	workshopSnapshots,
	workshopTestcases,
} from "@/db/schema";
import type { InvocationSolutionSnapshot } from "@/lib/services/workshop-invocations";
import type { InvocationResultCell } from "@/lib/workshop/invocation-subscriber";
import type { WorkshopSnapshotStateJson } from "@/lib/workshop/snapshot-contract";

export interface ReadinessIssue {
	code:
		| "no_snapshot"
		| "testcase_invalid"
		| "testcase_missing_output"
		| "no_main_solution"
		| "no_checker"
		| "main_not_all_ac"
		| "problem_missing";
	message: string;
}

export interface ReadinessResult {
	ready: boolean;
	/** The snapshot used for the check (newest committed). null if none. */
	snapshotId: number | null;
	snapshotLabel: string | null;
	snapshotCreatedAt: Date | null;
	issues: ReadinessIssue[];
}

/**
 * Compute publish readiness for a workshop problem against its most recent
 * committed snapshot. Pure read-only -- safe to call from UI and from the
 * publish action (as a guard).
 */
export async function computePublishReadiness(workshopProblemId: number): Promise<ReadinessResult> {
	const [wp] = await db
		.select()
		.from(workshopProblems)
		.where(eq(workshopProblems.id, workshopProblemId))
		.limit(1);

	if (!wp) {
		return {
			ready: false,
			snapshotId: null,
			snapshotLabel: null,
			snapshotCreatedAt: null,
			issues: [{ code: "problem_missing", message: "창작마당 문제를 찾을 수 없습니다." }],
		};
	}

	const [snap] = await db
		.select()
		.from(workshopSnapshots)
		.where(eq(workshopSnapshots.workshopProblemId, workshopProblemId))
		.orderBy(desc(workshopSnapshots.createdAt))
		.limit(1);

	if (!snap) {
		return {
			ready: false,
			snapshotId: null,
			snapshotLabel: null,
			snapshotCreatedAt: null,
			issues: [
				{
					code: "no_snapshot",
					message: "커밋된 스냅샷이 없습니다. 먼저 스냅샷을 커밋하세요.",
				},
			],
		};
	}

	const state = snap.stateJson as WorkshopSnapshotStateJson;
	const issues: ReadinessIssue[] = [];

	// 1. Checker must exist (spec §8).
	if (!state.problem.checkerHash || !state.problem.checkerLanguage) {
		issues.push({
			code: "no_checker",
			message: "스냅샷에 체커가 설정되어 있지 않습니다.",
		});
	}

	// 2. Every testcase must have output.
	const missingOutput = state.testcases.filter((t) => !t.outputHash);
	if (missingOutput.length > 0) {
		issues.push({
			code: "testcase_missing_output",
			message: `정답이 생성되지 않은 테스트케이스가 ${missingOutput.length}개 있습니다 (index: ${missingOutput
				.map((t) => t.index)
				.join(", ")}).`,
		});
	}

	// 3. isMain solution must exist.
	const main = state.solutions.find((s) => s.isMain);
	if (!main) {
		issues.push({
			code: "no_main_solution",
			message: "isMain=true 솔루션이 스냅샷에 없습니다.",
		});
	}

	// 4. Check live testcase validation status (draft rows, not snapshot).
	const [draft] = await db
		.select({ id: workshopDrafts.id })
		.from(workshopDrafts)
		.where(eq(workshopDrafts.workshopProblemId, workshopProblemId))
		.limit(1);
	if (draft) {
		const invalidTestcases = await db
			.select({ id: workshopTestcases.id, index: workshopTestcases.index })
			.from(workshopTestcases)
			.where(
				and(
					eq(workshopTestcases.draftId, draft.id),
					eq(workshopTestcases.validationStatus, "invalid")
				)
			);
		if (invalidTestcases.length > 0) {
			issues.push({
				code: "testcase_invalid",
				message: `밸리데이션 실패 테스트케이스가 ${invalidTestcases.length}개 있습니다 (index: ${invalidTestcases
					.map((t) => t.index)
					.join(", ")}).`,
			});
		}
	}

	// 5. Check that the main solution passed all testcases in the latest invocation.
	if (main) {
		const [latestInv] = await db
			.select()
			.from(workshopInvocations)
			.where(
				and(
					eq(workshopInvocations.workshopProblemId, workshopProblemId),
					eq(workshopInvocations.status, "completed")
				)
			)
			.orderBy(desc(workshopInvocations.createdAt))
			.limit(1);
		if (latestInv) {
			const solutions = latestInv.selectedSolutionsJson as InvocationSolutionSnapshot[];
			// InvocationSolutionSnapshot does not include isMain; match by name only.
			// Name uniqueness within a draft is enforced by workshopSolutions schema.
			const mainSol = solutions.find((s) => s.name === main.name);
			if (mainSol) {
				const results = latestInv.resultsJson as InvocationResultCell[];
				const mainResults = results.filter((r) => r.solutionId === mainSol.id);
				const failedCells = mainResults.filter((r) => r.verdict !== "accepted");
				if (failedCells.length > 0) {
					issues.push({
						code: "main_not_all_ac",
						message: `메인 솔루션이 ${failedCells.length}개 테스트에서 AC가 아닙니다 (verdict: ${[...new Set(failedCells.map((c) => c.verdict))].join(", ")}).`,
					});
				}
			}
		}
	}

	return {
		ready: issues.length === 0,
		snapshotId: snap.id,
		snapshotLabel: snap.label,
		snapshotCreatedAt: snap.createdAt,
		issues,
	};
}
