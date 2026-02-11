"use server";

import { and, count, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contestParticipants, contests, users } from "@/db/schema";
import { getSessionInfo, requireAdmin, requireAuth } from "@/lib/auth-utils";

// Register for Contest
export async function registerForContest(contestId: number) {
	const { userId, session } = await requireAuth();

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

	// Verify user exists in database
	const [userExists] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!userExists) {
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
	const { userId } = await requireAuth();

	await db
		.delete(contestParticipants)
		.where(
			and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
		);

	revalidatePath(`/contests/${contestId}`);

	return { success: true };
}

// Check if User is Registered
export async function isUserRegistered(contestId: number, userId?: number) {
	const { userId: sessionUserId } = await getSessionInfo();
	const targetUserId = userId ?? sessionUserId;

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
	const { userId, isAdmin } = await getSessionInfo();
	if (!isAdmin) {
		// Check if user is registered for this contest
		if (!userId) {
			throw new Error("Unauthorized");
		}
		const registered = await isUserRegistered(contestId, userId);
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

// Add Participant to Contest (Admin only)
export async function addParticipantToContest(contestId: number, userId: number) {
	await requireAdmin();

	// Check if contest exists
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
	if (!contest) {
		throw new Error("대회를 찾을 수 없습니다");
	}

	// Check if user exists
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) {
		throw new Error("사용자를 찾을 수 없습니다");
	}

	// Check if already registered
	const [existing] = await db
		.select()
		.from(contestParticipants)
		.where(
			and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
		)
		.limit(1);

	if (existing) {
		throw new Error("이미 참가 중인 사용자입니다");
	}

	// Add participant
	await db.insert(contestParticipants).values({
		contestId,
		userId,
	});

	revalidatePath(`/admin/contests/${contestId}/participants`);
	revalidatePath(`/contests/${contestId}`);

	return { success: true };
}

// Remove Participant from Contest (Admin only)
export async function removeParticipantFromContest(contestId: number, userId: number) {
	await requireAdmin();

	await db
		.delete(contestParticipants)
		.where(
			and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
		);

	revalidatePath(`/admin/contests/${contestId}/participants`);
	revalidatePath(`/contests/${contestId}`);

	return { success: true };
}

// Search Users (for adding participants)
export async function searchUsers(query: string, limit: number = 20) {
	await requireAdmin();

	if (!query || query.trim().length === 0) {
		return [];
	}

	const searchTerm = `%${query.trim()}%`;

	const results = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
		})
		.from(users)
		.where(or(ilike(users.username, searchTerm), ilike(users.name, searchTerm)))
		.limit(limit);

	return results;
}

export type GetContestParticipantsReturn = Awaited<ReturnType<typeof getContestParticipants>>;
export type ContestParticipantItem = GetContestParticipantsReturn["participants"][number];
