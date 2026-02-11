"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contestProblems, contests, problems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

// Add Problem to Contest
export async function addProblemToContest(data: {
	contestId: number;
	problemId: number;
	label: string;
}) {
	await requireAdmin();

	// 입력 유효성 검사
	if (!data.label || data.label.trim().length === 0) {
		throw new Error("문제 번호는 필수입니다");
	}

	if (data.label.length > 10) {
		throw new Error("문제 번호는 10자를 초과할 수 없습니다");
	}

	// 대회 존재 확인
	const [contest] = await db
		.select()
		.from(contests)
		.where(eq(contests.id, data.contestId))
		.limit(1);
	if (!contest) {
		throw new Error("대회를 찾을 수 없습니다");
	}

	// 문제 존재 확인
	const [problem] = await db
		.select()
		.from(problems)
		.where(eq(problems.id, data.problemId))
		.limit(1);
	if (!problem) {
		throw new Error("문제를 찾을 수 없습니다");
	}

	// 중복 확인 (같은 대회에 같은 문제)
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

	// 중복 라벨 확인
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

	// Get max order
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

	revalidatePath(`/contests/${data.contestId}`);
	revalidatePath(`/admin/contests/${data.contestId}`);

	return contestProblem;
}

// Remove Problem from Contest
export async function removeProblemFromContest(contestProblemId: number, contestId: number) {
	await requireAdmin();

	await db.delete(contestProblems).where(eq(contestProblems.id, contestProblemId));

	revalidatePath(`/contests/${contestId}`);
	revalidatePath(`/admin/contests/${contestId}`);

	return { success: true };
}

// Reorder Contest Problems
export async function reorderContestProblems(contestId: number, problemIds: number[]) {
	await requireAdmin();

	// Update order for each problem
	await Promise.all(
		problemIds.map((id, index) =>
			db.update(contestProblems).set({ order: index }).where(eq(contestProblems.id, id))
		)
	);

	revalidatePath(`/contests/${contestId}`);
	revalidatePath(`/admin/contests/${contestId}`);

	return { success: true };
}
