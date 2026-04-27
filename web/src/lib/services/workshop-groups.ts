import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, workshopGroupMembers, workshopGroups, workshopProblems } from "@/db/schema";

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
