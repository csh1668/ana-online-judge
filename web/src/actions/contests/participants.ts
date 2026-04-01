"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contestParticipants, contests, users } from "@/db/schema";
import { getSessionInfo, requireAdmin, requireAuth } from "@/lib/auth-utils";
import * as adminContestParticipants from "@/lib/services/contest-participants";

export async function registerForContest(contestId: number) {
	const { userId, session } = await requireAuth();

	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
	if (!contest) {
		throw new Error("대회를 찾을 수 없습니다");
	}

	if (contest.visibility === "private" && session.user.role !== "admin") {
		throw new Error("비공개 대회는 초대를 통해서만 참가할 수 있습니다");
	}

	const now = new Date();
	if (now > contest.endTime) {
		throw new Error("이미 종료된 대회입니다");
	}

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

	await db.insert(contestParticipants).values({ contestId, userId });
	revalidatePath(`/contests/${contestId}`);
	return { success: true, alreadyRegistered: false };
}

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

export async function getContestParticipants(
	contestId: number,
	options?: { page?: number; limit?: number }
) {
	const { userId, isAdmin } = await getSessionInfo();
	if (!isAdmin) {
		if (!userId) {
			throw new Error("Unauthorized");
		}
		const registered = await isUserRegistered(contestId, userId);
		if (!registered) {
			throw new Error("Unauthorized");
		}
	}

	return adminContestParticipants.getContestParticipants(contestId, options);
}

export async function addParticipantToContest(contestId: number, userId: number) {
	await requireAdmin();
	const result = await adminContestParticipants.addParticipantToContest(contestId, userId);
	revalidatePath(`/admin/contests/${contestId}/participants`);
	revalidatePath(`/contests/${contestId}`);
	return result;
}

export async function removeParticipantFromContest(contestId: number, userId: number) {
	await requireAdmin();
	const result = await adminContestParticipants.removeParticipantFromContest(contestId, userId);
	revalidatePath(`/admin/contests/${contestId}/participants`);
	revalidatePath(`/contests/${contestId}`);
	return result;
}

export async function searchUsers(query: string, limit: number = 20) {
	await requireAdmin();
	const { searchUsers: search } = await import("@/lib/services/users");
	return search(query, limit);
}

export type GetContestParticipantsReturn = Awaited<ReturnType<typeof getContestParticipants>>;
export type ContestParticipantItem = GetContestParticipantsReturn["participants"][number];
