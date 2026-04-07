import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type ContestVisibility,
	contestProblems,
	contests,
	problems,
	type ScoreboardType,
	submissions,
} from "@/db/schema";

export async function getContests(options?: {
	page?: number;
	limit?: number;
	visibility?: ContestVisibility;
	status?: "upcoming" | "running" | "finished";
}) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const whereConditions = [];

	if (options?.visibility) {
		whereConditions.push(eq(contests.visibility, options.visibility));
	}

	const now = new Date();
	if (options?.status === "upcoming") {
		whereConditions.push(gte(contests.startTime, now));
	} else if (options?.status === "running") {
		whereConditions.push(lte(contests.startTime, now));
		whereConditions.push(gte(contests.endTime, now));
	} else if (options?.status === "finished") {
		whereConditions.push(lte(contests.endTime, now));
	}

	const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

	const [contestsList, totalResult] = await Promise.all([
		db
			.select()
			.from(contests)
			.where(whereClause)
			.orderBy(desc(contests.startTime))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(contests).where(whereClause),
	]);

	return {
		contests: contestsList,
		total: totalResult[0].count,
	};
}

export async function getContestById(id: number) {
	const [contest] = await db.select().from(contests).where(eq(contests.id, id)).limit(1);
	if (!contest) {
		return null;
	}

	const contestProblemsList = await db
		.select({
			id: contestProblems.id,
			label: contestProblems.label,
			order: contestProblems.order,
			problem: {
				id: problems.id,
				title: problems.title,
				maxScore: problems.maxScore,
				problemType: problems.problemType,
				judgeAvailable: problems.judgeAvailable,
				languageRestricted: sql<boolean>`${problems.allowedLanguages} IS NOT NULL`,
			},
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(eq(contestProblems.contestId, id))
		.orderBy(contestProblems.order);

	return { ...contest, problems: contestProblemsList };
}

export async function createContest(data: {
	title: string;
	description?: string;
	startTime: Date;
	endTime: Date;
	freezeMinutes?: number | null;
	visibility?: ContestVisibility;
	scoreboardType?: ScoreboardType;
	penaltyMinutes?: number;
}) {
	if (!data.title || data.title.trim().length === 0) {
		throw new Error("대회 제목은 필수입니다");
	}
	if (data.title.length > 200) {
		throw new Error("대회 제목은 200자를 초과할 수 없습니다");
	}
	if (data.endTime <= data.startTime) {
		throw new Error("종료 시간은 시작 시간보다 이후여야 합니다");
	}
	if (data.freezeMinutes !== null && data.freezeMinutes !== undefined) {
		if (data.freezeMinutes < 0) {
			throw new Error("프리즈 시간은 0 이상이어야 합니다");
		}
		const durationMinutes = (data.endTime.getTime() - data.startTime.getTime()) / 60000;
		if (data.freezeMinutes > durationMinutes) {
			throw new Error("프리즈 시간은 대회 전체 시간을 초과할 수 없습니다");
		}
	}
	if (data.penaltyMinutes !== undefined && data.penaltyMinutes < 0) {
		throw new Error("패널티는 0 이상이어야 합니다");
	}

	const [contest] = await db
		.insert(contests)
		.values({
			title: data.title.trim(),
			description: data.description?.trim(),
			startTime: data.startTime,
			endTime: data.endTime,
			freezeMinutes: data.freezeMinutes ?? 60,
			visibility: data.visibility ?? "public",
			scoreboardType: data.scoreboardType ?? "basic",
			penaltyMinutes: data.penaltyMinutes ?? 20,
		})
		.returning();

	return contest;
}

export async function updateContest(
	id: number,
	data: {
		title?: string;
		description?: string;
		startTime?: Date;
		endTime?: Date;
		freezeMinutes?: number | null;
		visibility?: ContestVisibility;
		scoreboardType?: ScoreboardType;
		penaltyMinutes?: number;
	}
) {
	if (data.title !== undefined) {
		if (data.title.trim().length === 0) {
			throw new Error("대회 제목은 비어있을 수 없습니다");
		}
		if (data.title.length > 200) {
			throw new Error("대회 제목은 200자를 초과할 수 없습니다");
		}
	}

	if (data.startTime && data.endTime) {
		if (data.endTime <= data.startTime) {
			throw new Error("종료 시간은 시작 시간보다 이후여야 합니다");
		}
	} else if (data.startTime || data.endTime) {
		const [existing] = await db.select().from(contests).where(eq(contests.id, id)).limit(1);
		if (!existing) {
			throw new Error("대회를 찾을 수 없습니다");
		}
		const startTime = data.startTime || existing.startTime;
		const endTime = data.endTime || existing.endTime;
		if (endTime <= startTime) {
			throw new Error("종료 시간은 시작 시간보다 이후여야 합니다");
		}
	}

	if (data.freezeMinutes !== null && data.freezeMinutes !== undefined && data.freezeMinutes < 0) {
		throw new Error("프리즈 시간은 0 이상이어야 합니다");
	}
	if (data.penaltyMinutes !== undefined && data.penaltyMinutes < 0) {
		throw new Error("패널티는 0 이상이어야 합니다");
	}

	const updateData: typeof data = { ...data };
	if (updateData.title) {
		updateData.title = updateData.title.trim();
	}
	if (updateData.description) {
		updateData.description = updateData.description.trim();
	}

	const [updatedContest] = await db
		.update(contests)
		.set({ ...updateData, updatedAt: new Date() })
		.where(eq(contests.id, id))
		.returning();

	return updatedContest;
}

export async function deleteContest(id: number) {
	await db.delete(submissions).where(eq(submissions.contestId, id));
	await db.delete(contests).where(eq(contests.id, id));
	return { success: true };
}

export async function toggleFreezeState(contestId: number) {
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
	if (!contest) {
		throw new Error("Contest not found");
	}

	const [updated] = await db
		.update(contests)
		.set({ isFrozen: !contest.isFrozen, updatedAt: new Date() })
		.where(eq(contests.id, contestId))
		.returning();

	return updated;
}
