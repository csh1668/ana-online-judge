import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { playgroundSessions, users, workshopProblems } from "@/db/schema";

export const DEFAULT_PLAYGROUND_QUOTA = 3;
export const DEFAULT_WORKSHOP_QUOTA = 5;

// Drizzle transaction callback argument type
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getPlaygroundUsageTx(tx: Tx | typeof db, userId: number): Promise<number> {
	const [{ n }] = await tx
		.select({ n: count() })
		.from(playgroundSessions)
		.where(eq(playgroundSessions.userId, userId));
	return n;
}

async function getWorkshopUsageTx(tx: Tx | typeof db, userId: number): Promise<number> {
	const [{ n }] = await tx
		.select({ n: count() })
		.from(workshopProblems)
		.where(eq(workshopProblems.createdBy, userId));
	return n;
}

export async function getPlaygroundUsage(userId: number): Promise<number> {
	return getPlaygroundUsageTx(db, userId);
}

export async function getWorkshopUsage(userId: number): Promise<number> {
	return getWorkshopUsageTx(db, userId);
}

export async function getUserQuotas(userId: number): Promise<{
	playgroundQuota: number;
	workshopQuota: number;
	role: "user" | "admin";
}> {
	const [row] = await db
		.select({
			playgroundQuota: users.playgroundQuota,
			workshopQuota: users.workshopQuota,
			role: users.role,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!row) throw new Error("사용자를 찾을 수 없습니다");
	return row;
}

/**
 * Remaining slots. Returns Infinity for admin users.
 */
export async function getPlaygroundRemaining(userId: number): Promise<number> {
	const { role, playgroundQuota } = await getUserQuotas(userId);
	if (role === "admin") return Number.POSITIVE_INFINITY;
	const usage = await getPlaygroundUsage(userId);
	return Math.max(playgroundQuota - usage, 0);
}

export async function getWorkshopRemaining(userId: number): Promise<number> {
	const { role, workshopQuota } = await getUserQuotas(userId);
	if (role === "admin") return Number.POSITIVE_INFINITY;
	const usage = await getWorkshopUsage(userId);
	return Math.max(workshopQuota - usage, 0);
}

/**
 * Assert the user can create another playground session.
 * Must be called inside the same transaction as the subsequent INSERT so that
 * the FOR UPDATE row lock serializes concurrent creates per user.
 */
export async function assertCanCreatePlayground(userId: number, tx: Tx): Promise<void> {
	const [row] = await tx
		.select({ role: users.role, quota: users.playgroundQuota })
		.from(users)
		.where(eq(users.id, userId))
		.for("update")
		.limit(1);
	if (!row) throw new Error("사용자를 찾을 수 없습니다");
	if (row.role === "admin") return;
	const usage = await getPlaygroundUsageTx(tx, userId);
	if (usage >= row.quota) {
		throw new Error(`플레이그라운드 한도 초과 (${usage}/${row.quota})`);
	}
}

export async function assertCanCreateWorkshop(userId: number, tx: Tx): Promise<void> {
	const [row] = await tx
		.select({ role: users.role, quota: users.workshopQuota })
		.from(users)
		.where(eq(users.id, userId))
		.for("update")
		.limit(1);
	if (!row) throw new Error("사용자를 찾을 수 없습니다");
	if (row.role === "admin") return;
	const usage = await getWorkshopUsageTx(tx, userId);
	if (usage >= row.quota) {
		throw new Error(`창작마당 한도 초과 (${usage}/${row.quota})`);
	}
}

export async function setPlaygroundQuota(userId: number, quota: number): Promise<void> {
	if (!Number.isInteger(quota) || quota < 0) {
		throw new Error("한도는 0 이상의 정수여야 합니다");
	}
	await db
		.update(users)
		.set({ playgroundQuota: quota, updatedAt: new Date() })
		.where(eq(users.id, userId));
}

export async function setWorkshopQuota(userId: number, quota: number): Promise<void> {
	if (!Number.isInteger(quota) || quota < 0) {
		throw new Error("한도는 0 이상의 정수여야 합니다");
	}
	await db
		.update(users)
		.set({ workshopQuota: quota, updatedAt: new Date() })
		.where(eq(users.id, userId));
}
