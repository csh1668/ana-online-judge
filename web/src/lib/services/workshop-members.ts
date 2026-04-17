import { and, asc, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { users, workshopProblemMembers } from "@/db/schema";

export type WorkshopMemberRow = {
	userId: number;
	username: string;
	name: string;
	role: "owner" | "member";
	createdAt: Date;
};

/**
 * List all members of a workshop problem, joined with user identity. Ordered
 * by creation time ASC so the original owner shows up first.
 */
export async function listMembers(workshopProblemId: number): Promise<WorkshopMemberRow[]> {
	const rows = await db
		.select({
			userId: workshopProblemMembers.userId,
			username: users.username,
			name: users.name,
			role: workshopProblemMembers.role,
			createdAt: workshopProblemMembers.createdAt,
		})
		.from(workshopProblemMembers)
		.innerJoin(users, eq(users.id, workshopProblemMembers.userId))
		.where(eq(workshopProblemMembers.workshopProblemId, workshopProblemId))
		.orderBy(asc(workshopProblemMembers.createdAt));
	return rows;
}

/**
 * Add a new member to the workshop problem identified by username.
 *
 * Guards:
 * - Target user must exist.
 * - Target user must not already be a member of the problem.
 */
export async function addMember(
	workshopProblemId: number,
	username: string,
	role: "owner" | "member"
): Promise<void> {
	const trimmed = username.trim();
	if (!trimmed) throw new Error("사용자 아이디를 입력해주세요");

	const [target] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, trimmed))
		.limit(1);
	if (!target) throw new Error("해당 사용자를 찾을 수 없습니다");

	const [existing] = await db
		.select({ id: workshopProblemMembers.id })
		.from(workshopProblemMembers)
		.where(
			and(
				eq(workshopProblemMembers.workshopProblemId, workshopProblemId),
				eq(workshopProblemMembers.userId, target.id)
			)
		)
		.limit(1);
	if (existing) throw new Error("이미 멤버입니다");

	await db.insert(workshopProblemMembers).values({ workshopProblemId, userId: target.id, role });
}

/**
 * Remove a member. If the target is currently an owner, ensure at least one
 * OTHER owner remains (last-owner protection).
 */
export async function removeMember(workshopProblemId: number, targetUserId: number): Promise<void> {
	const [target] = await db
		.select({ role: workshopProblemMembers.role })
		.from(workshopProblemMembers)
		.where(
			and(
				eq(workshopProblemMembers.workshopProblemId, workshopProblemId),
				eq(workshopProblemMembers.userId, targetUserId)
			)
		)
		.limit(1);
	if (!target) throw new Error("해당 멤버를 찾을 수 없습니다");

	if (target.role === "owner") {
		const [{ otherOwners }] = await db
			.select({ otherOwners: count() })
			.from(workshopProblemMembers)
			.where(
				and(
					eq(workshopProblemMembers.workshopProblemId, workshopProblemId),
					eq(workshopProblemMembers.role, "owner"),
					ne(workshopProblemMembers.userId, targetUserId)
				)
			);
		if (otherOwners === 0) {
			throw new Error("마지막 소유자는 제거/강등할 수 없습니다");
		}
	}

	await db
		.delete(workshopProblemMembers)
		.where(
			and(
				eq(workshopProblemMembers.workshopProblemId, workshopProblemId),
				eq(workshopProblemMembers.userId, targetUserId)
			)
		);
}

/**
 * Change a member's role. If demoting an owner, ensure at least one OTHER
 * owner remains (last-owner protection).
 */
export async function changeMemberRole(
	workshopProblemId: number,
	targetUserId: number,
	newRole: "owner" | "member"
): Promise<void> {
	const [target] = await db
		.select({ role: workshopProblemMembers.role })
		.from(workshopProblemMembers)
		.where(
			and(
				eq(workshopProblemMembers.workshopProblemId, workshopProblemId),
				eq(workshopProblemMembers.userId, targetUserId)
			)
		)
		.limit(1);
	if (!target) throw new Error("해당 멤버를 찾을 수 없습니다");

	if (target.role === newRole) return; // no-op

	if (target.role === "owner" && newRole === "member") {
		const [{ otherOwners }] = await db
			.select({ otherOwners: count() })
			.from(workshopProblemMembers)
			.where(
				and(
					eq(workshopProblemMembers.workshopProblemId, workshopProblemId),
					eq(workshopProblemMembers.role, "owner"),
					ne(workshopProblemMembers.userId, targetUserId)
				)
			);
		if (otherOwners === 0) {
			throw new Error("마지막 소유자는 제거/강등할 수 없습니다");
		}
	}

	await db
		.update(workshopProblemMembers)
		.set({ role: newRole })
		.where(
			and(
				eq(workshopProblemMembers.workshopProblemId, workshopProblemId),
				eq(workshopProblemMembers.userId, targetUserId)
			)
		);
}
