"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

// Set Account as Contest-Only
export async function setAccountAsContestOnly(userId: number, contestId: number) {
	await requireAdmin();

	const [updatedUser] = await db
		.update(users)
		.set({
			contestAccountOnly: true,
			contestId: contestId,
			updatedAt: new Date(),
		})
		.where(eq(users.id, userId))
		.returning();

	revalidatePath("/admin/users");
	revalidatePath("/admin/contests");

	return updatedUser;
}

// Set Account as Normal (remove contest-only restriction)
export async function setAccountAsNormal(userId: number) {
	await requireAdmin();

	const [updatedUser] = await db
		.update(users)
		.set({
			contestAccountOnly: false,
			contestId: null,
			updatedAt: new Date(),
		})
		.where(eq(users.id, userId))
		.returning();

	revalidatePath("/admin/users");
	revalidatePath("/admin/contests");

	return updatedUser;
}

// Toggle Account Active Status
export async function toggleAccountActive(userId: number) {
	await requireAdmin();

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	if (!user) {
		throw new Error("User not found");
	}

	const [updatedUser] = await db
		.update(users)
		.set({
			isActive: !user.isActive,
			updatedAt: new Date(),
		})
		.where(eq(users.id, userId))
		.returning();

	revalidatePath("/admin/users");

	return updatedUser;
}

// Bulk Set Contest Accounts
export async function bulkSetContestAccounts(userIds: number[], contestId: number) {
	await requireAdmin();

	// 입력 유효성 검사
	if (userIds.length === 0) {
		throw new Error("사용자 ID 목록이 비어있습니다");
	}

	if (!contestId || contestId <= 0) {
		throw new Error("유효하지 않은 대회 ID입니다");
	}

	// 트랜잭션으로 일괄 처리
	await db.transaction(async (tx) => {
		for (const userId of userIds) {
			await tx
				.update(users)
				.set({
					contestAccountOnly: true,
					contestId: contestId,
					updatedAt: new Date(),
				})
				.where(eq(users.id, userId));
		}
	});

	revalidatePath("/admin/users");
	revalidatePath("/admin/contests");

	return { success: true, count: userIds.length };
}

// Get Contest-Only Accounts
export async function getContestAccounts(contestId?: number) {
	await requireAdmin();

	const whereConditions = [eq(users.contestAccountOnly, true)];

	if (contestId !== undefined) {
		whereConditions.push(eq(users.contestId, contestId));
	}

	const accounts = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			email: users.email,
			contestId: users.contestId,
			isActive: users.isActive,
			createdAt: users.createdAt,
		})
		.from(users)
		.where(and(...whereConditions))
		.orderBy(users.createdAt);

	return accounts;
}

// Get All Contest-Only Accounts (with contest info)
export async function getAllContestAccounts() {
	await requireAdmin();

	const accounts = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			email: users.email,
			contestId: users.contestId,
			isActive: users.isActive,
			contestAccountOnly: users.contestAccountOnly,
			createdAt: users.createdAt,
		})
		.from(users)
		.where(eq(users.contestAccountOnly, true))
		.orderBy(users.createdAt);

	return accounts;
}

// Get Contest-Only Account Stats
export async function getContestAccountStats(contestId: number) {
	await requireAdmin();

	const [stats] = await db
		.select({
			total: count(),
			active: sql<number>`SUM(CASE WHEN ${users.isActive} = true THEN 1 ELSE 0 END)`,
			inactive: sql<number>`SUM(CASE WHEN ${users.isActive} = false THEN 1 ELSE 0 END)`,
		})
		.from(users)
		.where(and(eq(users.contestAccountOnly, true), eq(users.contestId, contestId)));

	return {
		total: stats.total,
		active: Number(stats.active) || 0,
		inactive: Number(stats.inactive) || 0,
	};
}

export type GetContestAccountsReturn = Awaited<ReturnType<typeof getContestAccounts>>;
export type ContestAccountItem = GetContestAccountsReturn[number];
export type GetContestAccountStatsReturn = Awaited<ReturnType<typeof getContestAccountStats>>;
