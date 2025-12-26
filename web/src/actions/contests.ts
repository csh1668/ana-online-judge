"use server";

import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type ContestVisibility,
	contestParticipants,
	contestProblems,
	contests,
	problems,
	type ScoreboardType,
	users,
} from "@/db/schema";
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

	await db.delete(contests).where(eq(contests.id, id));

	revalidatePath("/contests");
	revalidatePath("/admin/contests");

	return { success: true };
}

// Get Contests (with filters)
export async function getContests(options?: {
	page?: number;
	limit?: number;
	visibility?: ContestVisibility;
	status?: "upcoming" | "running" | "finished";
}) {
	const session = await auth();
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const whereConditions = [];

	// Filter by visibility (admins can see all, users only see public)
	if (session?.user?.role !== "admin") {
		whereConditions.push(eq(contests.visibility, "public"));
	} else if (options?.visibility) {
		whereConditions.push(eq(contests.visibility, options.visibility));
	}

	// Filter by status
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

// Get Contest by ID
export async function getContestById(id: number) {
	const session = await auth();

	const [contest] = await db.select().from(contests).where(eq(contests.id, id)).limit(1);

	if (!contest) {
		return null;
	}

	// Check visibility
	if (contest.visibility === "private") {
		// Admins can always see private contests
		if (session?.user?.role === "admin") {
			// Continue to load contest
		} else if (session?.user) {
			// Check if user is registered for this contest
			const [participant] = await db
				.select()
				.from(contestParticipants)
				.where(
					and(
						eq(contestParticipants.contestId, id),
						eq(contestParticipants.userId, parseInt(session.user.id, 10))
					)
				)
				.limit(1);

			// If not registered, deny access
			if (!participant) {
				return null;
			}
		} else {
			// Not logged in, deny access
			return null;
		}
	}

	// Get contest problems with problem details
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
			},
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(eq(contestProblems.contestId, id))
		.orderBy(contestProblems.order);

	return {
		...contest,
		problems: contestProblemsList,
	};
}

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

// Register for Contest
export async function registerForContest(contestId: number) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("로그인이 필요합니다");
	}

	// Check if contest exists and is accessible
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);

	if (!contest) {
		throw new Error("대회를 찾을 수 없습니다");
	}

	// 비공개 대회는 관리자만 직접 참가자 추가 가능
	if (contest.visibility === "private" && session.user.role !== "admin") {
		throw new Error("비공개 대회는 초대를 통해서만 참가할 수 있습니다");
	}

	// 대회가 이미 끝난 경우
	const now = new Date();
	if (now > contest.endTime) {
		throw new Error("이미 종료된 대회입니다");
	}

	// Check if already registered
	const userId = parseInt(session.user.id, 10);

	// Verify user exists in database
	const [userExists] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!userExists) {
		console.error(`User ID mismatch: session.user.id=${session.user.id}, parsed userId=${userId}`);
		throw new Error("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
	}

	const [existing] = await db
		.select()
		.from(contestParticipants)
		.where(
			and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
		)
		.limit(1);

	if (existing) {
		return { success: true, alreadyRegistered: true };
	}

	// Register
	await db.insert(contestParticipants).values({
		contestId,
		userId,
	});

	revalidatePath(`/contests/${contestId}`);

	return { success: true, alreadyRegistered: false };
}

// Unregister from Contest
export async function unregisterFromContest(contestId: number) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Unauthorized");
	}

	await db
		.delete(contestParticipants)
		.where(
			and(
				eq(contestParticipants.contestId, contestId),
				eq(contestParticipants.userId, parseInt(session.user.id, 10))
			)
		);

	revalidatePath(`/contests/${contestId}`);

	return { success: true };
}

// Check if User is Registered
export async function isUserRegistered(contestId: number, userId?: number) {
	const session = await auth();
	const targetUserId = userId ?? (session?.user?.id ? parseInt(session.user.id, 10) : null);

	if (!targetUserId) {
		return false;
	}

	const [participant] = await db
		.select()
		.from(contestParticipants)
		.where(
			and(
				eq(contestParticipants.contestId, contestId),
				eq(contestParticipants.userId, targetUserId)
			)
		)
		.limit(1);

	return !!participant;
}

// Get Contest Participants
export async function getContestParticipants(
	contestId: number,
	options?: { page?: number; limit?: number }
) {
	const session = await auth();
	if (session?.user?.role !== "admin") {
		// Check if user is registered for this contest
		if (!session?.user?.id) {
			throw new Error("Unauthorized");
		}
		const registered = await isUserRegistered(contestId, parseInt(session.user.id, 10));
		if (!registered) {
			throw new Error("Unauthorized");
		}
	}

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 100;
	const offset = (page - 1) * limit;

	const [participantsList, totalResult] = await Promise.all([
		db
			.select({
				id: contestParticipants.id,
				userId: contestParticipants.userId,
				registeredAt: contestParticipants.registeredAt,
				user: {
					username: users.username,
					name: users.name,
				},
			})
			.from(contestParticipants)
			.innerJoin(users, eq(contestParticipants.userId, users.id))
			.where(eq(contestParticipants.contestId, contestId))
			.orderBy(contestParticipants.registeredAt)
			.limit(limit)
			.offset(offset),
		db
			.select({ count: count() })
			.from(contestParticipants)
			.where(eq(contestParticipants.contestId, contestId)),
	]);

	return {
		participants: participantsList,
		total: totalResult[0].count,
	};
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

export type GetContestsReturn = Awaited<ReturnType<typeof getContests>>;
export type ContestListItem = GetContestsReturn["contests"][number];
export type GetContestByIdReturn = Awaited<ReturnType<typeof getContestById>>;
export type GetContestParticipantsReturn = Awaited<ReturnType<typeof getContestParticipants>>;
export type ContestParticipantItem = GetContestParticipantsReturn["participants"][number];
