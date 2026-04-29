import { and, asc, count, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { type Practice, practiceProblems, practices, problems, users } from "@/db/schema";
import {
	getKstStartOfToday,
	PRACTICE_DEFAULT_PENALTY,
	PRACTICE_MAX_DURATION_MINUTES,
	PRACTICE_MAX_PROBLEMS,
	PRACTICE_MIN_DURATION_MINUTES,
	PRACTICE_MIN_PROBLEMS,
} from "@/lib/practice-utils";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function labelForIndex(index: number): string {
	let n = index;
	let out = "";
	do {
		out = String.fromCharCode(65 + (n % 26)) + out;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return out;
}

export async function getPracticeQuotaStatus(userId: number): Promise<{
	canCreate: boolean;
	reason?: "daily_limit" | "active_limit" | "contest_only_account";
	todayCount: number;
	activeCount: number;
}> {
	const [user] = await db
		.select({ role: users.role, contestAccountOnly: users.contestAccountOnly })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) throw new Error("사용자를 찾을 수 없습니다");
	if (user.role === "admin") {
		return { canCreate: true, todayCount: 0, activeCount: 0 };
	}
	if (user.contestAccountOnly) {
		return { canCreate: false, reason: "contest_only_account", todayCount: 0, activeCount: 0 };
	}
	const todayStart = getKstStartOfToday();
	const now = new Date();
	const [todayRow] = await db
		.select({ n: count() })
		.from(practices)
		.where(and(eq(practices.createdBy, userId), gte(practices.createdAt, todayStart)));
	const [activeRow] = await db
		.select({ n: count() })
		.from(practices)
		.where(and(eq(practices.createdBy, userId), gt(practices.endTime, now)));
	const todayCount = todayRow.n;
	const activeCount = activeRow.n;
	if (todayCount >= 1) return { canCreate: false, reason: "daily_limit", todayCount, activeCount };
	if (activeCount >= 1)
		return { canCreate: false, reason: "active_limit", todayCount, activeCount };
	return { canCreate: true, todayCount, activeCount };
}

async function assertCanCreatePractice(userId: number, tx: Tx): Promise<void> {
	const [row] = await tx
		.select({ role: users.role, contestAccountOnly: users.contestAccountOnly })
		.from(users)
		.where(eq(users.id, userId))
		.for("update")
		.limit(1);
	if (!row) throw new Error("사용자를 찾을 수 없습니다");
	if (row.role === "admin") return;
	if (row.contestAccountOnly) {
		throw new Error("이 계정은 연습을 생성할 수 없습니다");
	}
	const todayStart = getKstStartOfToday();
	const now = new Date();
	const [todayRow] = await tx
		.select({ n: count() })
		.from(practices)
		.where(and(eq(practices.createdBy, userId), gte(practices.createdAt, todayStart)));
	if (todayRow.n >= 1) throw new Error("오늘은 이미 연습을 생성하셨습니다 (하루 1개 제한)");
	const [activeRow] = await tx
		.select({ n: count() })
		.from(practices)
		.where(and(eq(practices.createdBy, userId), gt(practices.endTime, now)));
	if (activeRow.n >= 1)
		throw new Error("진행 중이거나 예정된 연습이 이미 있습니다 (활성 1개 제한)");
}

function validatePracticeFields(data: {
	title: string;
	startTime: Date;
	endTime: Date;
	penaltyMinutes?: number;
}) {
	const title = data.title.trim();
	if (title.length === 0) throw new Error("제목은 필수입니다");
	if (title.length > 200) throw new Error("제목은 200자를 초과할 수 없습니다");
	const now = new Date();
	const effectiveStart = data.startTime > now ? data.startTime : now;
	const durationMs = data.endTime.getTime() - effectiveStart.getTime();
	const durationMinutes = durationMs / 60000;
	if (durationMinutes < PRACTICE_MIN_DURATION_MINUTES) {
		throw new Error(`연습 기간은 최소 ${PRACTICE_MIN_DURATION_MINUTES}분 이상이어야 합니다`);
	}
	if (durationMinutes > PRACTICE_MAX_DURATION_MINUTES) {
		throw new Error("연습 기간은 최대 7일을 초과할 수 없습니다");
	}
	if (data.penaltyMinutes !== undefined && data.penaltyMinutes < 0) {
		throw new Error("패널티는 0 이상이어야 합니다");
	}
}

export async function createPractice(
	userId: number,
	data: {
		title: string;
		description?: string;
		startTime: Date;
		endTime: Date;
		penaltyMinutes?: number;
		problemIds: number[];
	}
): Promise<Practice> {
	validatePracticeFields(data);
	if (data.problemIds.length < PRACTICE_MIN_PROBLEMS) {
		throw new Error("최소 1개의 문제를 선택해야 합니다");
	}
	if (data.problemIds.length > PRACTICE_MAX_PROBLEMS) {
		throw new Error(`문제는 최대 ${PRACTICE_MAX_PROBLEMS}개까지 선택할 수 있습니다`);
	}
	const uniqueProblemIds = Array.from(new Set(data.problemIds));
	if (uniqueProblemIds.length !== data.problemIds.length) {
		throw new Error("중복된 문제가 포함되어 있습니다");
	}

	return await db.transaction(async (tx) => {
		await assertCanCreatePractice(userId, tx);

		const eligibleProblems = await tx
			.select({ id: problems.id })
			.from(problems)
			.where(
				and(
					inArray(problems.id, uniqueProblemIds),
					eq(problems.isPublic, true),
					eq(problems.judgeAvailable, true)
				)
			);
		if (eligibleProblems.length !== uniqueProblemIds.length) {
			throw new Error("선택할 수 없는 문제가 포함되어 있습니다 (비공개이거나 채점 불가)");
		}

		const [practice] = await tx
			.insert(practices)
			.values({
				title: data.title.trim(),
				description: data.description?.trim() || null,
				createdBy: userId,
				startTime: data.startTime,
				endTime: data.endTime,
				penaltyMinutes: data.penaltyMinutes ?? PRACTICE_DEFAULT_PENALTY,
			})
			.returning();

		await tx.insert(practiceProblems).values(
			uniqueProblemIds.map((problemId, index) => ({
				practiceId: practice.id,
				problemId,
				label: labelForIndex(index),
				order: index,
			}))
		);

		return practice;
	});
}

export async function updatePractice(
	actorId: number,
	practiceId: number,
	data: {
		title?: string;
		description?: string;
		startTime?: Date;
		endTime?: Date;
		penaltyMinutes?: number;
	}
): Promise<Practice> {
	const [actor] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, actorId))
		.limit(1);
	if (!actor) throw new Error("사용자를 찾을 수 없습니다");

	const [existing] = await db.select().from(practices).where(eq(practices.id, practiceId)).limit(1);
	if (!existing) throw new Error("연습을 찾을 수 없습니다");
	if (existing.createdBy !== actorId && actor.role !== "admin") {
		throw new Error("이 연습을 수정할 권한이 없습니다");
	}

	const now = new Date();
	const hasStarted = now >= existing.startTime;

	const newStart = data.startTime ?? existing.startTime;
	const newEnd = data.endTime ?? existing.endTime;

	if (hasStarted && data.startTime && data.startTime.getTime() !== existing.startTime.getTime()) {
		throw new Error("시작된 연습의 시작 시각은 변경할 수 없습니다");
	}
	if (hasStarted && data.endTime && data.endTime.getTime() > existing.endTime.getTime()) {
		throw new Error("시작된 연습의 종료 시각은 단축만 가능합니다");
	}

	if (newEnd <= newStart) throw new Error("종료 시각은 시작 시각보다 이후여야 합니다");
	if (data.title !== undefined || data.startTime !== undefined || data.endTime !== undefined) {
		validatePracticeFields({
			title: (data.title ?? existing.title) as string,
			startTime: newStart,
			endTime: newEnd,
			penaltyMinutes: data.penaltyMinutes,
		});
	}
	if (hasStarted && newEnd <= now) {
		throw new Error("종료 시각은 현재 이후여야 합니다");
	}

	const updateValues: Record<string, unknown> = { updatedAt: new Date() };
	if (data.title !== undefined) updateValues.title = data.title.trim();
	if (data.description !== undefined) updateValues.description = data.description.trim() || null;
	if (data.startTime !== undefined) updateValues.startTime = data.startTime;
	if (data.endTime !== undefined) updateValues.endTime = data.endTime;
	if (data.penaltyMinutes !== undefined) updateValues.penaltyMinutes = data.penaltyMinutes;

	const [updated] = await db
		.update(practices)
		.set(updateValues)
		.where(eq(practices.id, practiceId))
		.returning();
	return updated;
}

export async function deletePractice(actorId: number, practiceId: number) {
	const [actor] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, actorId))
		.limit(1);
	if (!actor) throw new Error("사용자를 찾을 수 없습니다");

	const [existing] = await db.select().from(practices).where(eq(practices.id, practiceId)).limit(1);
	if (!existing) throw new Error("연습을 찾을 수 없습니다");
	if (existing.createdBy !== actorId && actor.role !== "admin") {
		throw new Error("이 연습을 삭제할 권한이 없습니다");
	}

	await db.delete(practices).where(eq(practices.id, practiceId));
	return { success: true };
}

export async function getPractices(options?: {
	page?: number;
	limit?: number;
	status?: "upcoming" | "running" | "finished";
	createdBy?: number;
}) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const whereConditions = [];
	const now = new Date();
	if (options?.status === "upcoming") {
		whereConditions.push(gt(practices.startTime, now));
	} else if (options?.status === "running") {
		whereConditions.push(lte(practices.startTime, now));
		whereConditions.push(gte(practices.endTime, now));
	} else if (options?.status === "finished") {
		whereConditions.push(lte(practices.endTime, now));
	}
	if (options?.createdBy !== undefined) {
		whereConditions.push(eq(practices.createdBy, options.createdBy));
	}
	const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

	const [rows, totalResult] = await Promise.all([
		db
			.select({
				id: practices.id,
				title: practices.title,
				description: practices.description,
				createdBy: practices.createdBy,
				startTime: practices.startTime,
				endTime: practices.endTime,
				penaltyMinutes: practices.penaltyMinutes,
				createdAt: practices.createdAt,
				updatedAt: practices.updatedAt,
				creatorUsername: users.username,
				creatorName: users.name,
			})
			.from(practices)
			.innerJoin(users, eq(practices.createdBy, users.id))
			.where(whereClause)
			.orderBy(desc(practices.startTime))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(practices).where(whereClause),
	]);
	return { practices: rows, total: totalResult[0].count };
}

export async function getPracticeById(id: number) {
	const [practice] = await db
		.select({
			id: practices.id,
			title: practices.title,
			description: practices.description,
			createdBy: practices.createdBy,
			startTime: practices.startTime,
			endTime: practices.endTime,
			penaltyMinutes: practices.penaltyMinutes,
			createdAt: practices.createdAt,
			updatedAt: practices.updatedAt,
			creatorUsername: users.username,
			creatorName: users.name,
		})
		.from(practices)
		.innerJoin(users, eq(practices.createdBy, users.id))
		.where(eq(practices.id, id))
		.limit(1);
	if (!practice) return null;

	const problemList = await db
		.select({
			id: practiceProblems.id,
			label: practiceProblems.label,
			order: practiceProblems.order,
			problem: {
				id: problems.id,
				title: problems.displayTitle,
				maxScore: problems.maxScore,
				problemType: problems.problemType,
				judgeAvailable: problems.judgeAvailable,
				languageRestricted: sql<boolean>`${problems.allowedLanguages} IS NOT NULL`,
				hasSubtasks: problems.hasSubtasks,
				tier: problems.tier,
			},
		})
		.from(practiceProblems)
		.innerJoin(problems, eq(practiceProblems.problemId, problems.id))
		.where(eq(practiceProblems.practiceId, id))
		.orderBy(asc(practiceProblems.order));
	return { ...practice, problems: problemList };
}

export type GetPracticesReturn = Awaited<ReturnType<typeof getPractices>>;
export type PracticeListItem = GetPracticesReturn["practices"][number];
export type GetPracticeByIdReturn = Awaited<ReturnType<typeof getPracticeById>>;
