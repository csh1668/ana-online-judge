import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workshopGroupMembers } from "@/db/schema";

/**
 * Require the current user to be logged in. Returns userId + admin flag.
 * Quota enforcement is NOT done here — it happens at creation time in
 * `assertCanCreateWorkshop`.
 */
export async function requireWorkshopAccess(): Promise<{ userId: number; isAdmin: boolean }> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("로그인이 필요합니다");
	}
	const userId = Number.parseInt(session.user.id, 10);
	const isAdmin = session.user.role === "admin";
	return { userId, isAdmin };
}

/**
 * Require the user to be a member of the group (or admin). Returns the user's
 * group role ("owner" | "member" | null when admin viewing without membership).
 */
export async function requireGroupAccess(
	groupId: number
): Promise<{ userId: number; isAdmin: boolean; role: "owner" | "member" | null }> {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const [m] = await db
		.select({ role: workshopGroupMembers.role })
		.from(workshopGroupMembers)
		.where(and(eq(workshopGroupMembers.groupId, groupId), eq(workshopGroupMembers.userId, userId)))
		.limit(1);
	if (!m && !isAdmin) {
		throw new Error("그룹을 찾을 수 없거나 접근 권한이 없습니다");
	}
	return { userId, isAdmin, role: m?.role ?? null };
}

/**
 * Require the user to be a group owner (or admin).
 */
export async function requireGroupOwner(
	groupId: number
): Promise<{ userId: number; isAdmin: boolean }> {
	const { userId, isAdmin, role } = await requireGroupAccess(groupId);
	if (!isAdmin && role !== "owner") {
		throw new Error("그룹 owner만 수행할 수 있습니다");
	}
	return { userId, isAdmin };
}
