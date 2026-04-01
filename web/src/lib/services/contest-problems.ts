import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contestProblems, contests, problems } from "@/db/schema";

export async function addProblemToContest(data: {
	contestId: number;
	problemId: number;
	label: string;
}) {
	if (!data.label || data.label.trim().length === 0) {
		throw new Error("문제 번호는 필수입니다");
	}
	if (data.label.length > 10) {
		throw new Error("문제 번호는 10자를 초과할 수 없습니다");
	}

	const [contest] = await db
		.select()
		.from(contests)
		.where(eq(contests.id, data.contestId))
		.limit(1);
	if (!contest) {
		throw new Error("대회를 찾을 수 없습니다");
	}

	const [problem] = await db
		.select()
		.from(problems)
		.where(eq(problems.id, data.problemId))
		.limit(1);
	if (!problem) {
		throw new Error("문제를 찾을 수 없습니다");
	}

	const [existing] = await db
		.select()
		.from(contestProblems)
		.where(
			and(
				eq(contestProblems.contestId, data.contestId),
				eq(contestProblems.problemId, data.problemId)
			)
		)
		.limit(1);

	if (existing) {
		throw new Error("이미 대회에 추가된 문제입니다");
	}

	const [duplicateLabel] = await db
		.select()
		.from(contestProblems)
		.where(
			and(
				eq(contestProblems.contestId, data.contestId),
				eq(contestProblems.label, data.label.trim())
			)
		)
		.limit(1);

	if (duplicateLabel) {
		throw new Error("같은 번호를 가진 문제가 이미 존재합니다");
	}

	const [maxOrderResult] = await db
		.select({ maxOrder: sql<number>`COALESCE(MAX(${contestProblems.order}), -1)` })
		.from(contestProblems)
		.where(eq(contestProblems.contestId, data.contestId));

	const nextOrder = Number(maxOrderResult?.maxOrder ?? -1) + 1;

	const [contestProblem] = await db
		.insert(contestProblems)
		.values({
			contestId: data.contestId,
			problemId: data.problemId,
			label: data.label.trim(),
			order: nextOrder,
		})
		.returning();

	return contestProblem;
}

export async function removeProblemFromContest(contestProblemId: number) {
	await db.delete(contestProblems).where(eq(contestProblems.id, contestProblemId));
	return { success: true };
}

export async function reorderContestProblems(_contestId: number, problemIds: number[]) {
	await Promise.all(
		problemIds.map((id, index) =>
			db.update(contestProblems).set({ order: index }).where(eq(contestProblems.id, id))
		)
	);
	return { success: true };
}
