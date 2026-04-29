import { and, asc, count, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { practiceProblems, practices, problems, users } from "@/db/schema";
import { PRACTICE_MAX_PROBLEMS, PRACTICE_MIN_PROBLEMS } from "@/lib/practice-utils";

function labelForIndex(index: number): string {
	let n = index;
	let out = "";
	do {
		out = String.fromCharCode(65 + (n % 26)) + out;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return out;
}

async function assertOwnerOrAdmin(actorId: number, practiceId: number) {
	const [actor] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, actorId))
		.limit(1);
	if (!actor) throw new Error("사용자를 찾을 수 없습니다");
	const [practice] = await db
		.select({ createdBy: practices.createdBy })
		.from(practices)
		.where(eq(practices.id, practiceId))
		.limit(1);
	if (!practice) throw new Error("연습을 찾을 수 없습니다");
	if (practice.createdBy !== actorId && actor.role !== "admin") {
		throw new Error("이 연습을 수정할 권한이 없습니다");
	}
}

export async function addProblemToPractice(actorId: number, practiceId: number, problemId: number) {
	await assertOwnerOrAdmin(actorId, practiceId);

	const [problem] = await db
		.select({
			id: problems.id,
			isPublic: problems.isPublic,
			judgeAvailable: problems.judgeAvailable,
		})
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);
	if (!problem) throw new Error("문제를 찾을 수 없습니다");
	if (!problem.isPublic || !problem.judgeAvailable) {
		throw new Error("선택할 수 없는 문제입니다 (비공개이거나 채점 불가)");
	}

	const [existing] = await db
		.select()
		.from(practiceProblems)
		.where(
			and(eq(practiceProblems.practiceId, practiceId), eq(practiceProblems.problemId, problemId))
		)
		.limit(1);
	if (existing) throw new Error("이미 추가된 문제입니다");

	const [{ n }] = await db
		.select({ n: count() })
		.from(practiceProblems)
		.where(eq(practiceProblems.practiceId, practiceId));
	if (n >= PRACTICE_MAX_PROBLEMS) {
		throw new Error(`문제는 최대 ${PRACTICE_MAX_PROBLEMS}개까지 추가할 수 있습니다`);
	}

	const [{ maxOrder }] = await db
		.select({ maxOrder: max(practiceProblems.order) })
		.from(practiceProblems)
		.where(eq(practiceProblems.practiceId, practiceId));
	const nextOrder = (maxOrder ?? -1) + 1;

	const [inserted] = await db
		.insert(practiceProblems)
		.values({
			practiceId,
			problemId,
			label: labelForIndex(nextOrder),
			order: nextOrder,
		})
		.returning();
	await db.update(practices).set({ updatedAt: new Date() }).where(eq(practices.id, practiceId));
	return inserted;
}

export async function removeProblemFromPractice(
	actorId: number,
	practiceId: number,
	practiceProblemId: number
) {
	await assertOwnerOrAdmin(actorId, practiceId);
	const [{ n }] = await db
		.select({ n: count() })
		.from(practiceProblems)
		.where(eq(practiceProblems.practiceId, practiceId));
	if (n <= PRACTICE_MIN_PROBLEMS) {
		throw new Error("연습에는 최소 1개의 문제가 필요합니다");
	}
	await db
		.delete(practiceProblems)
		.where(
			and(eq(practiceProblems.id, practiceProblemId), eq(practiceProblems.practiceId, practiceId))
		);
	await db.update(practices).set({ updatedAt: new Date() }).where(eq(practices.id, practiceId));
	return { success: true };
}

export async function listPracticeProblems(practiceId: number) {
	return db
		.select({
			id: practiceProblems.id,
			practiceId: practiceProblems.practiceId,
			problemId: practiceProblems.problemId,
			label: practiceProblems.label,
			order: practiceProblems.order,
		})
		.from(practiceProblems)
		.where(eq(practiceProblems.practiceId, practiceId))
		.orderBy(asc(practiceProblems.order));
}
