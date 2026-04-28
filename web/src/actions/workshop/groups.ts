"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { searchUsers } from "@/lib/services/users";
import * as svc from "@/lib/services/workshop-groups";
import { requireGroupAccess, requireGroupOwner } from "@/lib/workshop/auth";

async function requireAdmin(): Promise<{ userId: number }> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("로그인이 필요합니다");
	if (session.user.role !== "admin") throw new Error("관리자 권한이 필요합니다");
	return { userId: Number.parseInt(session.user.id, 10) };
}

// ===== admin actions =====

export async function createGroup(input: {
	name: string;
	description?: string;
	initialOwnerUsername: string;
}) {
	const { userId } = await requireAdmin();
	const trimmed = input.initialOwnerUsername.trim();
	if (!trimmed) throw new Error("초기 owner 사용자명을 입력해주세요");
	const [target] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, trimmed))
		.limit(1);
	if (!target) throw new Error("해당 사용자를 찾을 수 없습니다");
	const created = await svc.createGroup({
		name: input.name,
		description: input.description,
		initialOwnerUserId: target.id,
		createdBy: userId,
	});
	revalidatePath("/admin/workshop/groups");
	revalidatePath("/workshop");
	return created;
}

export async function listAllGroupsForAdmin() {
	await requireAdmin();
	return svc.listAllGroups();
}

export async function searchUsersForAdmin(query: string, limit?: number) {
	await requireAdmin();
	return searchUsers(query, limit);
}

// ===== owner actions =====

export async function updateGroup(groupId: number, patch: { name?: string; description?: string }) {
	await requireGroupOwner(groupId);
	await svc.updateGroup(groupId, patch);
	revalidatePath(`/workshop/groups/${groupId}`);
	revalidatePath("/workshop");
}

export async function deleteGroup(groupId: number) {
	await requireGroupOwner(groupId);
	await svc.deleteGroup(groupId);
	revalidatePath("/workshop");
	revalidatePath("/admin/workshop/groups");
}

export async function addGroupMember(groupId: number, username: string, role: "owner" | "member") {
	await requireGroupOwner(groupId);
	await svc.addGroupMember(groupId, username, role);
	revalidatePath(`/workshop/groups/${groupId}/members`);
	revalidatePath(`/workshop/groups/${groupId}`);
}

export async function removeGroupMember(groupId: number, targetUserId: number) {
	await requireGroupOwner(groupId);
	await svc.removeGroupMember(groupId, targetUserId);
	revalidatePath(`/workshop/groups/${groupId}/members`);
	revalidatePath(`/workshop/groups/${groupId}`);
}

export async function changeGroupMemberRole(
	groupId: number,
	targetUserId: number,
	role: "owner" | "member"
) {
	await requireGroupOwner(groupId);
	await svc.changeGroupMemberRole(groupId, targetUserId, role);
	revalidatePath(`/workshop/groups/${groupId}/members`);
}

export async function searchUsersForGroupMember(groupId: number, query: string) {
	await requireGroupOwner(groupId);
	return searchUsers(query);
}

// ===== member actions =====

export async function listMyGroups() {
	const session = await auth();
	if (!session?.user?.id) return [];
	const userId = Number.parseInt(session.user.id, 10);
	return svc.listMyGroups(userId);
}

export async function listGroupMembers(groupId: number) {
	await requireGroupAccess(groupId);
	return svc.listGroupMembers(groupId);
}

export async function listGroupProblems(groupId: number) {
	await requireGroupAccess(groupId);
	return svc.listGroupProblems(groupId);
}

export async function getGroupReviewBundle(groupId: number) {
	await requireGroupAccess(groupId);
	return svc.listGroupProblemsWithReviewBundle(groupId);
}

export async function getGroupForUser(groupId: number) {
	const session = await auth();
	if (!session?.user?.id) throw new Error("로그인이 필요합니다");
	const userId = Number.parseInt(session.user.id, 10);
	const isAdmin = session.user.role === "admin";
	return svc.getGroupForUser(groupId, userId, isAdmin);
}
