import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	users,
	type WorkshopProblem,
	workshopDrafts,
	workshopGroupMembers,
	workshopProblemMembers,
	workshopProblems,
} from "@/db/schema";
import { assertCanCreateWorkshop } from "@/lib/services/quota";
import { resolveDisplayHeaders } from "@/lib/services/workshop-display";
import { deleteAllWithPrefix } from "@/lib/storage/operations";
import { draftUpdateConflictError } from "@/lib/workshop/draft-version-conflict";
import { ensureWorkshopDraft } from "@/lib/workshop/drafts";

export type WorkshopProblemListItem = {
	id: number;
	groupId: number | null;
	createdBy: number;
	publishedProblemId: number | null;
	createdAt: Date;
	updatedAt: Date;
	title: string;
	problemType: "icpc" | "special_judge";
	timeLimit: number;
	memoryLimit: number;
};

export type CreateWorkshopProblemInput = {
	title: string;
	problemType: "icpc" | "special_judge";
	timeLimit: number;
	memoryLimit: number;
	groupId?: number; // optional: when set, the problem belongs to a group
};

/**
 * Create a new workshop problem owned by userId. Inserts an owner row in
 * workshopProblemMembers. Header fields (title/limits/seed) live on the
 * per-user owner draft created via ensureWorkshopDraft.
 */
export async function createWorkshopProblem(
	input: CreateWorkshopProblemInput,
	userId: number
): Promise<WorkshopProblem> {
	return db.transaction(async (tx) => {
		await assertCanCreateWorkshop(userId, tx);

		// If groupId given, verify the user is a member (or admin). Action layer
		// should have called requireGroupAccess(groupId) already; this is a
		// defensive check.
		if (input.groupId !== undefined) {
			const [m] = await tx
				.select({ id: workshopGroupMembers.id })
				.from(workshopGroupMembers)
				.where(
					and(
						eq(workshopGroupMembers.groupId, input.groupId),
						eq(workshopGroupMembers.userId, userId)
					)
				)
				.limit(1);
			if (!m) {
				const [u] = await tx
					.select({ role: users.role })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
				if (u?.role !== "admin") {
					throw new Error("그룹 멤버가 아닙니다");
				}
			}
		}

		const [created] = await tx
			.insert(workshopProblems)
			.values({
				createdBy: userId,
				groupId: input.groupId ?? null,
			})
			.returning();

		await tx.insert(workshopProblemMembers).values({
			workshopProblemId: created.id,
			userId,
			role: "owner",
		});

		// Fan-out: insert "member" rows for the rest of the group
		if (input.groupId !== undefined) {
			await tx.execute(sql`
				INSERT INTO workshop_problem_members (workshop_problem_id, user_id, role)
				SELECT ${created.id}, m.user_id, 'member'::workshop_member_role
				FROM workshop_group_members m
				WHERE m.group_id = ${input.groupId} AND m.user_id != ${userId}
				ON CONFLICT (workshop_problem_id, user_id) DO NOTHING
			`);
		}

		return created;
	});
}

/**
 * List workshop problems the user is a member of (owner or member).
 * Admins receive every workshop problem regardless of membership.
 */
export async function listMyWorkshopProblems(
	userId: number,
	isAdmin = false
): Promise<WorkshopProblemListItem[]> {
	const identityColumns = {
		id: workshopProblems.id,
		groupId: workshopProblems.groupId,
		createdBy: workshopProblems.createdBy,
		publishedProblemId: workshopProblems.publishedProblemId,
		createdAt: workshopProblems.createdAt,
		updatedAt: workshopProblems.updatedAt,
	};

	let rows: {
		id: number;
		groupId: number | null;
		createdBy: number;
		publishedProblemId: number | null;
		createdAt: Date;
		updatedAt: Date;
	}[];
	if (isAdmin) {
		rows = await db
			.select(identityColumns)
			.from(workshopProblems)
			.orderBy(desc(workshopProblems.updatedAt));
	} else {
		const memberRows = await db
			.select({ problemId: workshopProblemMembers.workshopProblemId })
			.from(workshopProblemMembers)
			.where(eq(workshopProblemMembers.userId, userId));
		const ids = memberRows.map((r) => r.problemId);
		if (ids.length === 0) return [];
		rows = await db
			.select(identityColumns)
			.from(workshopProblems)
			.where(inArray(workshopProblems.id, ids))
			.orderBy(desc(workshopProblems.updatedAt));
	}

	const headers = await resolveDisplayHeaders(rows.map((r) => r.id));
	return rows.map((r) => {
		const h = headers.get(r.id);
		return {
			...r,
			title: h?.title ?? "",
			problemType: h?.problemType ?? "icpc",
			timeLimit: h?.timeLimit ?? 1000,
			memoryLimit: h?.memoryLimit ?? 512,
		};
	});
}

/**
 * Get a workshop problem if the user is a member (or admin). Returns null otherwise.
 * When `isAdmin` is true, membership check is bypassed.
 */
export async function getWorkshopProblemForUser(
	problemId: number,
	userId: number,
	isAdmin = false
): Promise<WorkshopProblem | null> {
	if (!isAdmin) {
		const [membership] = await db
			.select({ role: workshopProblemMembers.role })
			.from(workshopProblemMembers)
			.where(
				and(
					eq(workshopProblemMembers.workshopProblemId, problemId),
					eq(workshopProblemMembers.userId, userId)
				)
			)
			.limit(1);
		if (!membership) return null;
	}
	const [problem] = await db
		.select()
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	return problem ?? null;
}

/**
 * Update problem-level limits (time/memory). Any member can edit.
 * Validates ranges to match the new-problem form (time: 100-10000ms, memory: 16-2048MB).
 * 낙관적 버전 가드: `input.expectedVersion`이 현재 버전과 다르면 충돌 에러.
 */
export async function updateWorkshopProblemLimits(
	problemId: number,
	userId: number,
	input: { timeLimit: number; memoryLimit: number; expectedVersion: number },
	isAdmin = false
): Promise<{ version: number }> {
	const { timeLimit, memoryLimit, expectedVersion } = input;
	if (!Number.isInteger(timeLimit) || timeLimit < 100 || timeLimit > 10000) {
		throw new Error("시간 제한은 100~10000ms 사이의 정수여야 합니다");
	}
	if (!Number.isInteger(memoryLimit) || memoryLimit < 16 || memoryLimit > 2048) {
		throw new Error("메모리 제한은 16~2048MB 사이의 정수여야 합니다");
	}
	if (!isAdmin) {
		const [membership] = await db
			.select({ role: workshopProblemMembers.role })
			.from(workshopProblemMembers)
			.where(
				and(
					eq(workshopProblemMembers.workshopProblemId, problemId),
					eq(workshopProblemMembers.userId, userId)
				)
			)
			.limit(1);
		if (!membership) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	}
	await ensureWorkshopDraft(problemId, userId);
	const [updated] = await db
		.update(workshopDrafts)
		.set({
			timeLimit,
			memoryLimit,
			version: sql`${workshopDrafts.version} + 1`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(workshopDrafts.workshopProblemId, problemId),
				eq(workshopDrafts.userId, userId),
				eq(workshopDrafts.version, expectedVersion)
			)
		)
		.returning({ version: workshopDrafts.version });
	if (!updated) throw await draftUpdateConflictError(problemId, userId);
	return updated;
}

/**
 * Update the problem type (icpc ↔ special_judge) on the caller's draft.
 * Any member can edit (Phase A: per-draft).
 * 낙관적 버전 가드: `input.expectedVersion`이 현재 버전과 다르면 충돌 에러.
 */
export async function updateWorkshopProblemType(
	problemId: number,
	userId: number,
	input: { problemType: "icpc" | "special_judge"; expectedVersion: number },
	isAdmin = false
): Promise<{ version: number }> {
	const { problemType, expectedVersion } = input;
	if (problemType !== "icpc" && problemType !== "special_judge") {
		throw new Error("올바르지 않은 문제 형식입니다");
	}
	if (!isAdmin) {
		const [membership] = await db
			.select({ role: workshopProblemMembers.role })
			.from(workshopProblemMembers)
			.where(
				and(
					eq(workshopProblemMembers.workshopProblemId, problemId),
					eq(workshopProblemMembers.userId, userId)
				)
			)
			.limit(1);
		if (!membership) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
	}
	await ensureWorkshopDraft(problemId, userId);
	const [updated] = await db
		.update(workshopDrafts)
		.set({ problemType, version: sql`${workshopDrafts.version} + 1`, updatedAt: new Date() })
		.where(
			and(
				eq(workshopDrafts.workshopProblemId, problemId),
				eq(workshopDrafts.userId, userId),
				eq(workshopDrafts.version, expectedVersion)
			)
		)
		.returning({ version: workshopDrafts.version });
	if (!updated) throw await draftUpdateConflictError(problemId, userId);
	return updated;
}

/**
 * Delete a workshop problem entirely. The previously published `problems` row
 * (if any) is preserved — `workshopProblems.publishedProblemId` was a FK with
 * `onDelete: "set null"` going FROM workshop TO problems, so deleting the
 * workshop row does not propagate. All workshop-side data is removed:
 *
 * - DB: cascades through workshop_drafts, workshop_problem_members, snapshots,
 *       invocations, testcases (via drafts), generators, solutions, resources
 * - MinIO: `workshop/{problemId}/...` (drafts + objects + invocations)
 * - MinIO: `images/workshopProblems/{problemId}/...` (statement images)
 *
 * Permission: only the owner (or admin) can delete.
 */
export async function deleteWorkshopProblem(
	problemId: number,
	userId: number,
	isAdmin = false
): Promise<void> {
	if (!isAdmin) {
		const [problem] = await db
			.select({ groupId: workshopProblems.groupId, createdBy: workshopProblems.createdBy })
			.from(workshopProblems)
			.where(eq(workshopProblems.id, problemId))
			.limit(1);
		if (!problem) throw new Error("문제를 찾을 수 없습니다");

		if (problem.groupId !== null) {
			// Group problem: deleter must be createdBy OR a group owner
			if (problem.createdBy !== userId) {
				const [gm] = await db
					.select({ role: workshopGroupMembers.role })
					.from(workshopGroupMembers)
					.where(
						and(
							eq(workshopGroupMembers.groupId, problem.groupId),
							eq(workshopGroupMembers.userId, userId)
						)
					)
					.limit(1);
				if (gm?.role !== "owner") {
					throw new Error("문제 작성자 또는 그룹 owner만 삭제할 수 있습니다");
				}
			}
		} else {
			// Personal problem: keep existing per-problem owner check
			const [membership] = await db
				.select({ role: workshopProblemMembers.role })
				.from(workshopProblemMembers)
				.where(
					and(
						eq(workshopProblemMembers.workshopProblemId, problemId),
						eq(workshopProblemMembers.userId, userId)
					)
				)
				.limit(1);
			if (!membership) throw new Error("문제를 찾을 수 없거나 접근 권한이 없습니다");
			if (membership.role !== "owner") {
				throw new Error("소유자(owner)만 문제를 삭제할 수 있습니다");
			}
		}
	}

	// Delete MinIO data first (best-effort — DB delete still proceeds on failure
	// to avoid leaving orphan rows; MinIO orphans can be cleaned manually).
	const minioPrefixes = [`workshop/${problemId}/`, `images/workshopProblems/${problemId}/`];
	for (const prefix of minioPrefixes) {
		try {
			await deleteAllWithPrefix(prefix);
		} catch (e) {
			console.error(`[deleteWorkshopProblem] failed to wipe ${prefix}:`, e);
		}
	}

	// Cascade-delete the row. publishedProblemId is a FK FROM this side TO
	// problems with onDelete "set null" — so deleting the workshop row does
	// NOT touch the published problem. Other FKs (drafts, members, snapshots,
	// invocations) point INTO workshopProblems with onDelete cascade and will
	// be cleaned up automatically.
	await db.delete(workshopProblems).where(eq(workshopProblems.id, problemId));
}
