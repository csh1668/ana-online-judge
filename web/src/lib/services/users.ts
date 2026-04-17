import { count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { playgroundSessions, users, workshopProblems } from "@/db/schema";
import { col, tbl } from "@/lib/db-helpers";

export async function getAdminUsers(options?: { page?: number; limit?: number }) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	// Correlated subqueries reference the outer `users.id` via `col()` because
	// Drizzle's ${users.id} interpolation strips the table prefix, which would
	// collide with the inner tables' own `id` columns.
	const playgroundUsageSql = sql<number>`(
		SELECT COUNT(*)::int FROM ${tbl(playgroundSessions)}
		WHERE ${col(playgroundSessions, playgroundSessions.userId)} = ${col(users, users.id)}
	)`;
	const workshopUsageSql = sql<number>`(
		SELECT COUNT(*)::int FROM ${tbl(workshopProblems)}
		WHERE ${col(workshopProblems, workshopProblems.createdBy)} = ${col(users, users.id)}
	)`;

	const [usersList, totalResult] = await Promise.all([
		db
			.select({
				id: users.id,
				username: users.username,
				name: users.name,
				email: users.email,
				role: users.role,
				rating: users.rating,
				playgroundQuota: users.playgroundQuota,
				workshopQuota: users.workshopQuota,
				playgroundUsage: playgroundUsageSql,
				workshopUsage: workshopUsageSql,
				createdAt: users.createdAt,
			})
			.from(users)
			.orderBy(desc(users.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(users),
	]);

	return {
		users: usersList,
		total: totalResult[0].count,
	};
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
	const [updatedUser] = await db
		.update(users)
		.set({ role, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning();

	return updatedUser;
}

export async function deleteUser(userId: number, currentUserId: number) {
	if (currentUserId === userId) {
		throw new Error("자기 자신을 삭제할 수 없습니다.");
	}

	await db.delete(users).where(eq(users.id, userId));

	return { success: true };
}

export async function searchUsers(query: string, limit: number = 20) {
	if (!query || query.trim().length === 0) {
		return [];
	}

	const searchTerm = `%${query.trim()}%`;

	return db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
		})
		.from(users)
		.where(or(ilike(users.username, searchTerm), ilike(users.name, searchTerm)))
		.limit(limit);
}

export async function getUserByUsername(username: string) {
	const [user] = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			bio: users.bio,
			avatarUrl: users.avatarUrl,
			rating: users.rating,
			createdAt: users.createdAt,
		})
		.from(users)
		.where(eq(users.username, username))
		.limit(1);

	return user ?? null;
}

export async function updateUserProfile(
	userId: number,
	data: { name?: string; bio?: string | null; avatarUrl?: string | null }
) {
	const [updated] = await db
		.update(users)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning({
			id: users.id,
			name: users.name,
			bio: users.bio,
			avatarUrl: users.avatarUrl,
		});

	return updated;
}
