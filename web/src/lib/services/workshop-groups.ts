import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	users,
	workshopGroupMembers,
	workshopGroups,
	workshopProblemMembers,
	workshopProblems,
} from "@/db/schema";

export type GroupSummary = {
	id: number;
	name: string;
	description: string;
	memberCount: number;
	problemCount: number;
	createdAt: Date;
	updatedAt: Date;
	myRole: "owner" | "member" | null; // null when admin viewing all groups without membership
};

export type GroupMemberRow = {
	userId: number;
	username: string;
	name: string;
	role: "owner" | "member";
	createdAt: Date;
};

/**
 * Create a new workshop group with a single initial owner.
 * Caller must already have verified the actor is admin.
 */
export async function createGroup(input: {
	name: string;
	description?: string;
	initialOwnerUserId: number;
	createdBy: number;
}): Promise<{ id: number }> {
	const name = input.name.trim();
	if (!name) throw new Error("그룹 이름은 비어 있을 수 없습니다");
	if (name.length > 100) throw new Error("그룹 이름은 100자 이내여야 합니다");
	const description = (input.description ?? "").slice(0, 1000);

	return db.transaction(async (tx) => {
		const [created] = await tx
			.insert(workshopGroups)
			.values({ name, description, createdBy: input.createdBy })
			.returning({ id: workshopGroups.id });
		await tx.insert(workshopGroupMembers).values({
			groupId: created.id,
			userId: input.initialOwnerUserId,
			role: "owner",
		});
		return { id: created.id };
	});
}

export async function listAllGroups(): Promise<GroupSummary[]> {
	const rows = await db
		.select({
			id: workshopGroups.id,
			name: workshopGroups.name,
			description: workshopGroups.description,
			createdAt: workshopGroups.createdAt,
			updatedAt: workshopGroups.updatedAt,
			memberCount: sql<number>`(
				SELECT COUNT(*)::int FROM ${workshopGroupMembers}
				WHERE ${workshopGroupMembers.groupId} = ${workshopGroups.id}
			)`,
			problemCount: sql<number>`(
				SELECT COUNT(*)::int FROM ${workshopProblems}
				WHERE ${workshopProblems.groupId} = ${workshopGroups.id}
			)`,
		})
		.from(workshopGroups)
		.orderBy(desc(workshopGroups.updatedAt));
	return rows.map((r) => ({ ...r, myRole: null }));
}

export async function listMyGroups(userId: number): Promise<GroupSummary[]> {
	const rows = await db
		.select({
			id: workshopGroups.id,
			name: workshopGroups.name,
			description: workshopGroups.description,
			createdAt: workshopGroups.createdAt,
			updatedAt: workshopGroups.updatedAt,
			myRole: workshopGroupMembers.role,
			memberCount: sql<number>`(
				SELECT COUNT(*)::int FROM ${workshopGroupMembers} m2
				WHERE m2.group_id = ${workshopGroups.id}
			)`,
			problemCount: sql<number>`(
				SELECT COUNT(*)::int FROM ${workshopProblems}
				WHERE ${workshopProblems.groupId} = ${workshopGroups.id}
			)`,
		})
		.from(workshopGroups)
		.innerJoin(workshopGroupMembers, eq(workshopGroupMembers.groupId, workshopGroups.id))
		.where(eq(workshopGroupMembers.userId, userId))
		.orderBy(desc(workshopGroups.updatedAt));
	return rows;
}

export async function getGroupForUser(
	groupId: number,
	userId: number,
	isAdmin = false
): Promise<{
	id: number;
	name: string;
	description: string;
	createdAt: Date;
	updatedAt: Date;
	myRole: "owner" | "member" | null;
} | null> {
	const [m] = await db
		.select({ role: workshopGroupMembers.role })
		.from(workshopGroupMembers)
		.where(and(eq(workshopGroupMembers.groupId, groupId), eq(workshopGroupMembers.userId, userId)))
		.limit(1);
	const role: "owner" | "member" | null = m?.role ?? null;
	if (!m && !isAdmin) return null;

	const [g] = await db.select().from(workshopGroups).where(eq(workshopGroups.id, groupId)).limit(1);
	if (!g) return null;
	return {
		id: g.id,
		name: g.name,
		description: g.description,
		createdAt: g.createdAt,
		updatedAt: g.updatedAt,
		myRole: role,
	};
}

export async function updateGroup(
	groupId: number,
	patch: { name?: string; description?: string }
): Promise<void> {
	const upd: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.name !== undefined) {
		const name = patch.name.trim();
		if (!name) throw new Error("그룹 이름은 비어 있을 수 없습니다");
		if (name.length > 100) throw new Error("그룹 이름은 100자 이내여야 합니다");
		upd.name = name;
	}
	if (patch.description !== undefined) {
		upd.description = patch.description.slice(0, 1000);
	}
	await db.update(workshopGroups).set(upd).where(eq(workshopGroups.id, groupId));
}

export async function listGroupMembers(groupId: number): Promise<GroupMemberRow[]> {
	const rows = await db
		.select({
			userId: workshopGroupMembers.userId,
			username: users.username,
			name: users.name,
			role: workshopGroupMembers.role,
			createdAt: workshopGroupMembers.createdAt,
		})
		.from(workshopGroupMembers)
		.innerJoin(users, eq(users.id, workshopGroupMembers.userId))
		.where(eq(workshopGroupMembers.groupId, groupId))
		.orderBy(asc(workshopGroupMembers.createdAt));
	return rows;
}

/**
 * Add a user to a group, then fan-out into workshopProblemMembers for every
 * existing problem in the group. ON CONFLICT DO NOTHING ensures idempotency.
 */
export async function addGroupMember(
	groupId: number,
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

	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: workshopGroupMembers.id })
			.from(workshopGroupMembers)
			.where(
				and(eq(workshopGroupMembers.groupId, groupId), eq(workshopGroupMembers.userId, target.id))
			)
			.limit(1);
		if (existing) throw new Error("이미 그룹 멤버입니다");

		await tx.insert(workshopGroupMembers).values({ groupId, userId: target.id, role });

		await tx.execute(sql`
			INSERT INTO workshop_problem_members (workshop_problem_id, user_id, role)
			SELECT id, ${target.id}, 'member'::workshop_member_role
			FROM workshop_problems
			WHERE group_id = ${groupId}
			ON CONFLICT (workshop_problem_id, user_id) DO NOTHING
		`);
	});
}

/**
 * Remove a user from a group.
 *
 * - If the user is `createdBy` of any group problem, transfer ownership to
 *   another group owner (must exist or this throws).
 * - Last-owner protection at the group level: cannot remove the only owner.
 * - Removes their workshopProblemMembers rows for every group problem.
 */
export async function removeGroupMember(groupId: number, targetUserId: number): Promise<void> {
	await db.transaction(async (tx) => {
		const [target] = await tx
			.select({ role: workshopGroupMembers.role })
			.from(workshopGroupMembers)
			.where(
				and(
					eq(workshopGroupMembers.groupId, groupId),
					eq(workshopGroupMembers.userId, targetUserId)
				)
			)
			.limit(1);
		if (!target) throw new Error("해당 멤버를 찾을 수 없습니다");

		if (target.role === "owner") {
			const [{ otherOwners }] = await tx
				.select({ otherOwners: count() })
				.from(workshopGroupMembers)
				.where(
					and(
						eq(workshopGroupMembers.groupId, groupId),
						eq(workshopGroupMembers.role, "owner"),
						ne(workshopGroupMembers.userId, targetUserId)
					)
				);
			if (otherOwners === 0) {
				throw new Error("마지막 owner는 제거할 수 없습니다");
			}
		}

		const ownedProblems = await tx
			.select({ id: workshopProblems.id })
			.from(workshopProblems)
			.where(
				and(eq(workshopProblems.groupId, groupId), eq(workshopProblems.createdBy, targetUserId))
			);

		if (ownedProblems.length > 0) {
			const [newOwner] = await tx
				.select({ userId: workshopGroupMembers.userId })
				.from(workshopGroupMembers)
				.where(
					and(
						eq(workshopGroupMembers.groupId, groupId),
						eq(workshopGroupMembers.role, "owner"),
						ne(workshopGroupMembers.userId, targetUserId)
					)
				)
				.limit(1);
			if (!newOwner) {
				throw new Error(
					`이 멤버는 ${ownedProblems.length}개 문제의 작성자입니다. 다른 owner를 먼저 지정하세요.`
				);
			}
			const ownedIds = ownedProblems.map((p) => p.id);

			await tx
				.update(workshopProblems)
				.set({ createdBy: newOwner.userId, updatedAt: new Date() })
				.where(inArray(workshopProblems.id, ownedIds));

			await tx
				.update(workshopProblemMembers)
				.set({ role: "owner" })
				.where(
					and(
						inArray(workshopProblemMembers.workshopProblemId, ownedIds),
						eq(workshopProblemMembers.userId, newOwner.userId)
					)
				);

			console.info(
				`[workshop-groups] transferred ownership of ${ownedIds.length} problem(s) ` +
					`from user #${targetUserId} to user #${newOwner.userId} in group #${groupId}`
			);
		}

		await tx.execute(sql`
			DELETE FROM workshop_problem_members
			WHERE user_id = ${targetUserId}
			  AND workshop_problem_id IN (
			    SELECT id FROM workshop_problems WHERE group_id = ${groupId}
			  )
		`);

		await tx
			.delete(workshopGroupMembers)
			.where(
				and(
					eq(workshopGroupMembers.groupId, groupId),
					eq(workshopGroupMembers.userId, targetUserId)
				)
			);
	});
}

/**
 * Change a user's group-level role. Last-owner protection at the group level.
 * Per-problem `createdBy` is unaffected — a former group owner can still be
 * the problem owner of problems they created.
 */
export async function changeGroupMemberRole(
	groupId: number,
	targetUserId: number,
	newRole: "owner" | "member"
): Promise<void> {
	await db.transaction(async (tx) => {
		const [target] = await tx
			.select({ role: workshopGroupMembers.role })
			.from(workshopGroupMembers)
			.where(
				and(
					eq(workshopGroupMembers.groupId, groupId),
					eq(workshopGroupMembers.userId, targetUserId)
				)
			)
			.limit(1);
		if (!target) throw new Error("해당 멤버를 찾을 수 없습니다");
		if (target.role === newRole) return;

		if (target.role === "owner" && newRole === "member") {
			const [{ otherOwners }] = await tx
				.select({ otherOwners: count() })
				.from(workshopGroupMembers)
				.where(
					and(
						eq(workshopGroupMembers.groupId, groupId),
						eq(workshopGroupMembers.role, "owner"),
						ne(workshopGroupMembers.userId, targetUserId)
					)
				);
			if (otherOwners === 0) {
				throw new Error("마지막 owner는 강등할 수 없습니다");
			}
		}

		await tx
			.update(workshopGroupMembers)
			.set({ role: newRole })
			.where(
				and(
					eq(workshopGroupMembers.groupId, groupId),
					eq(workshopGroupMembers.userId, targetUserId)
				)
			);
	});
}
