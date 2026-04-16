"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { workshopProblemMembers } from "@/db/schema";
import * as svc from "@/lib/services/workshop-members";
import * as problemsSvc from "@/lib/services/workshop-problems";
import { requireWorkshopAccess } from "@/lib/workshop/auth";

async function requireOwner(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	if (isAdmin) return { userId, isAdmin };
	const [m] = await db
		.select({ role: workshopProblemMembers.role })
		.from(workshopProblemMembers)
		.where(
			and(
				eq(workshopProblemMembers.workshopProblemId, problemId),
				eq(workshopProblemMembers.userId, userId)
			)
		)
		.limit(1);
	if (!m || m.role !== "owner") throw new Error("소유자만 수행할 수 있습니다");
	return { userId, isAdmin };
}

export async function listWorkshopMembers(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	// Anyone with workshop access who is a member (or admin) can list.
	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	return svc.listMembers(problemId);
}

export async function addWorkshopMember(
	problemId: number,
	username: string,
	role: "owner" | "member"
) {
	await requireOwner(problemId);
	await svc.addMember(problemId, username, role);
	revalidatePath(`/workshop/${problemId}/members`);
}

export async function removeWorkshopMember(problemId: number, targetUserId: number) {
	await requireOwner(problemId);
	await svc.removeMember(problemId, targetUserId);
	revalidatePath(`/workshop/${problemId}/members`);
}

export async function changeWorkshopMemberRole(
	problemId: number,
	targetUserId: number,
	newRole: "owner" | "member"
) {
	await requireOwner(problemId);
	await svc.changeMemberRole(problemId, targetUserId, newRole);
	revalidatePath(`/workshop/${problemId}/members`);
}
