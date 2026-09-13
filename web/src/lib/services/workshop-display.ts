import { and, desc, eq, inArray, notLike } from "drizzle-orm";
import { db } from "@/db";
import {
	type WorkshopProblemType,
	workshopDrafts,
	workshopProblems,
	workshopSnapshots,
} from "@/db/schema";

export type WorkshopDisplayHeader = {
	title: string;
	description: string;
	problemType: WorkshopProblemType;
	timeLimit: number;
	memoryLimit: number;
};

type SnapshotProblem = {
	title: string;
	description: string;
	problemType: WorkshopProblemType;
	timeLimit: number;
	memoryLimit: number;
};

const FALLBACK: WorkshopDisplayHeader = {
	title: "(제목 없음)",
	description: "",
	problemType: "icpc",
	timeLimit: 1000,
	memoryLimit: 512,
};

function fromSnapshotProblem(p: SnapshotProblem): WorkshopDisplayHeader {
	return {
		title: p.title,
		description: p.description,
		problemType: p.problemType,
		timeLimit: p.timeLimit,
		memoryLimit: p.memoryLimit,
	};
}

/**
 * 여러 문제의 표시용 헤더를 배치 해석. 우선순위:
 *   1) 최신 user-committed 스냅샷(label NOT LIKE 'auto/%')의 stateJson.problem
 *   2) 생성자(createdBy)의 draft 헤더
 *   3) 안전 기본값
 */
export async function resolveDisplayHeaders(
	problemIds: number[]
): Promise<Map<number, WorkshopDisplayHeader>> {
	const result = new Map<number, WorkshopDisplayHeader>();
	if (problemIds.length === 0) return result;

	const snaps = await db
		.select({
			problemId: workshopSnapshots.workshopProblemId,
			stateJson: workshopSnapshots.stateJson,
			id: workshopSnapshots.id,
		})
		.from(workshopSnapshots)
		.where(
			and(
				inArray(workshopSnapshots.workshopProblemId, problemIds),
				notLike(workshopSnapshots.label, "auto/%")
			)
		)
		.orderBy(desc(workshopSnapshots.id));
	const latestByProblem = new Map<number, unknown>();
	for (const s of snaps) {
		if (!latestByProblem.has(s.problemId)) latestByProblem.set(s.problemId, s.stateJson);
	}
	for (const pid of problemIds) {
		const state = latestByProblem.get(pid) as { problem?: SnapshotProblem } | undefined;
		if (state?.problem) result.set(pid, fromSnapshotProblem(state.problem));
	}

	const missing = problemIds.filter((pid) => !result.has(pid));
	if (missing.length > 0) {
		const rows = await db
			.select({
				problemId: workshopDrafts.workshopProblemId,
				userId: workshopDrafts.userId,
				createdBy: workshopProblems.createdBy,
				title: workshopDrafts.title,
				description: workshopDrafts.description,
				problemType: workshopDrafts.problemType,
				timeLimit: workshopDrafts.timeLimit,
				memoryLimit: workshopDrafts.memoryLimit,
			})
			.from(workshopDrafts)
			.innerJoin(workshopProblems, eq(workshopProblems.id, workshopDrafts.workshopProblemId))
			.where(inArray(workshopDrafts.workshopProblemId, missing));
		for (const r of rows) {
			if (r.userId !== r.createdBy) continue;
			result.set(r.problemId, {
				title: r.title,
				description: r.description,
				problemType: r.problemType,
				timeLimit: r.timeLimit,
				memoryLimit: r.memoryLimit,
			});
		}
	}

	for (const pid of problemIds) {
		if (!result.has(pid)) result.set(pid, { ...FALLBACK });
	}
	return result;
}

export async function resolveDisplayHeader(problemId: number): Promise<WorkshopDisplayHeader> {
	const m = await resolveDisplayHeaders([problemId]);
	return m.get(problemId) ?? { ...FALLBACK };
}
