import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { contestParticipants, contests, users } from "@/db/schema";

export async function getContestParticipants(
	contestId: number,
	options?: { page?: number; limit?: number }
) {
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

export async function addParticipantToContest(contestId: number, userId: number) {
	const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
	if (!contest) {
		throw new Error("대회를 찾을 수 없습니다");
	}

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) {
		throw new Error("사용자를 찾을 수 없습니다");
	}

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

	await db.insert(contestParticipants).values({ contestId, userId });

	return { success: true };
}

export async function removeParticipantFromContest(contestId: number, userId: number) {
	await db
		.delete(contestParticipants)
		.where(
			and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
		);

	return { success: true };
}
