"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";
import { clearImpersonationCookie, setImpersonationCookie } from "@/lib/impersonation";
import * as quotaSvc from "@/lib/services/quota";
import * as adminUsers from "@/lib/services/users";

export async function getAdminUsers(...args: Parameters<typeof adminUsers.getAdminUsers>) {
	await requireAdmin();
	return adminUsers.getAdminUsers(...args);
}

export async function updateUserRole(...args: Parameters<typeof adminUsers.updateUserRole>) {
	await requireAdmin();
	const result = await adminUsers.updateUserRole(...args);
	revalidatePath("/admin/users");
	return result;
}

export async function setPlaygroundQuota(userId: number, quota: number) {
	await requireAdmin();
	await quotaSvc.setPlaygroundQuota(userId, quota);
	revalidatePath("/admin/users");
}

export async function setWorkshopQuota(userId: number, quota: number) {
	await requireAdmin();
	await quotaSvc.setWorkshopQuota(userId, quota);
	revalidatePath("/admin/users");
}

// deleteUser has different signature: server action derives currentUserId from session
export async function deleteUser(userId: number) {
	const currentUser = await requireAdmin();
	const result = await adminUsers.deleteUser(userId, parseInt(currentUser.id, 10));
	revalidatePath("/admin/users");
	return result;
}

export async function resetUserPassword(userId: number) {
	await requireAdmin();
	const result = await adminUsers.resetUserPassword(userId);
	revalidatePath("/admin/users");
	return result;
}

export async function startImpersonation(targetUserId: number) {
	const currentUser = await requireAdmin();
	const currentUserId = parseInt(currentUser.id, 10);

	if (currentUserId === targetUserId) {
		throw new Error("자기 자신으로는 대리 로그인할 수 없습니다.");
	}

	const [targetUser] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, targetUserId))
		.limit(1);

	if (!targetUser) {
		throw new Error("대상 사용자를 찾을 수 없습니다.");
	}

	await setImpersonationCookie(targetUserId);
}

export async function stopImpersonation() {
	await clearImpersonationCookie();
}

export type GetAdminUsersReturn = Awaited<ReturnType<typeof getAdminUsers>>;
export type AdminUserListItem = GetAdminUsersReturn["users"][number];
export type UpdateUserRoleReturn = Awaited<ReturnType<typeof updateUserRole>>;
export type DeleteUserReturn = Awaited<ReturnType<typeof deleteUser>>;
export type ResetUserPasswordReturn = Awaited<ReturnType<typeof resetUserPassword>>;
