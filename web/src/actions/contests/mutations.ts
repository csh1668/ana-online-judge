"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ContestVisibility, contests, type ScoreboardType, submissions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

// Create Contest
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
	await requireAdmin();

	// 입력 유효성 검사
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

	revalidatePath("/contests");
	revalidatePath("/admin/contests");

	return contest;
}

// Update Contest
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
	await requireAdmin();

	// 입력 유효성 검사
	if (data.title !== undefined) {
		if (data.title.trim().length === 0) {
			throw new Error("대회 제목은 비어있을 수 없습니다");
		}
		if (data.title.length > 200) {
			throw new Error("대회 제목은 200자를 초과할 수 없습니다");
		}
	}

	// 날짜 검증 (둘 다 제공된 경우)
	if (data.startTime && data.endTime) {
		if (data.endTime <= data.startTime) {
			throw new Error("종료 시간은 시작 시간보다 이후여야 합니다");
		}
	} else if (data.startTime || data.endTime) {
		// 하나만 제공된 경우, 기존 데이터와 비교 필요
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

	// 데이터 정리
	const updateData: typeof data = { ...data };
	if (updateData.title) {
		updateData.title = updateData.title.trim();
	}
	if (updateData.description) {
		updateData.description = updateData.description.trim();
	}

	const [updatedContest] = await db
		.update(contests)
		.set({
			...updateData,
			updatedAt: new Date(),
		})
		.where(eq(contests.id, id))
		.returning();

	revalidatePath("/contests");
	revalidatePath(`/contests/${id}`);
	revalidatePath("/admin/contests");
	revalidatePath(`/admin/contests/${id}`);

	return updatedContest;
}

// Delete Contest
export async function deleteContest(id: number) {
	await requireAdmin();

	// Delete related submissions first since there's no cascade constraint in DB schema
	await db.delete(submissions).where(eq(submissions.contestId, id));
	await db.delete(contests).where(eq(contests.id, id));

	revalidatePath("/contests");
	revalidatePath("/admin/contests");

	return { success: true };
}

// Toggle Freeze State
export async function toggleFreezeState(contestId: number) {
	await requireAdmin();

	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);

	if (!contest) {
		throw new Error("Contest not found");
	}

	const [updated] = await db
		.update(contests)
		.set({
			isFrozen: !contest.isFrozen,
			updatedAt: new Date(),
		})
		.where(eq(contests.id, contestId))
		.returning();

	revalidatePath(`/contests/${contestId}/scoreboard`);
	revalidatePath(`/admin/contests/${contestId}`);

	return updated;
}
