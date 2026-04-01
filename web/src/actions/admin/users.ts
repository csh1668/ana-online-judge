"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
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

export async function togglePlaygroundAccess(
	...args: Parameters<typeof adminUsers.togglePlaygroundAccess>
) {
	await requireAdmin();
	const result = await adminUsers.togglePlaygroundAccess(...args);
	revalidatePath("/admin/users");
	return result;
}

// deleteUser has different signature: server action derives currentUserId from session
export async function deleteUser(userId: number) {
	const currentUser = await requireAdmin();
	const result = await adminUsers.deleteUser(userId, parseInt(currentUser.id, 10));
	revalidatePath("/admin/users");
	return result;
}

export type GetAdminUsersReturn = Awaited<ReturnType<typeof getAdminUsers>>;
export type AdminUserListItem = GetAdminUsersReturn["users"][number];
export type UpdateUserRoleReturn = Awaited<ReturnType<typeof updateUserRole>>;
export type TogglePlaygroundAccessReturn = Awaited<ReturnType<typeof togglePlaygroundAccess>>;
export type DeleteUserReturn = Awaited<ReturnType<typeof deleteUser>>;
