"use server";

import { count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

// Users management
export async function getAdminUsers(options?: { page?: number; limit?: number }) {
	await requireAdmin();

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const [usersList, totalResult] = await Promise.all([
		db
			.select({
				id: users.id,
				username: users.username,
				email: users.email,
				name: users.name,
				role: users.role,
				rating: users.rating,
				playgroundAccess: users.playgroundAccess,
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
	await requireAdmin();

	const [updatedUser] = await db
		.update(users)
		.set({ role, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning();

	revalidatePath("/admin/users");

	return updatedUser;
}

export async function togglePlaygroundAccess(userId: number, hasAccess: boolean) {
	await requireAdmin();

	const [updatedUser] = await db
		.update(users)
		.set({ playgroundAccess: hasAccess, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning();

	revalidatePath("/admin/users");

	return updatedUser;
}

export async function deleteUser(userId: number) {
	const currentUser = await requireAdmin();

	// 자기 자신을 삭제하지 못하도록 방지
	if (parseInt(currentUser.id, 10) === userId) {
		throw new Error("자기 자신을 삭제할 수 없습니다.");
	}

	// 사용자 삭제 (cascade로 관련 데이터 자동 삭제)
	await db.delete(users).where(eq(users.id, userId));

	revalidatePath("/admin/users");

	return { success: true };
}

export type GetAdminUsersReturn = Awaited<ReturnType<typeof getAdminUsers>>;
export type AdminUserListItem = GetAdminUsersReturn["users"][number];
export type UpdateUserRoleReturn = Awaited<ReturnType<typeof updateUserRole>>;
export type TogglePlaygroundAccessReturn = Awaited<ReturnType<typeof togglePlaygroundAccess>>;
export type DeleteUserReturn = Awaited<ReturnType<typeof deleteUser>>;
