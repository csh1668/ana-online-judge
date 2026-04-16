import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopProblem, workshopProblemMembers, workshopProblems } from "@/db/schema";
import { deleteAllWithPrefix } from "@/lib/storage/operations";

export type CreateWorkshopProblemInput = {
	title: string;
	problemType: "icpc" | "special_judge";
	timeLimit: number;
	memoryLimit: number;
};

/**
 * Create a new workshop problem owned by userId. Generates a random seed and
 * inserts an owner row in workshopProblemMembers.
 */
export async function createWorkshopProblem(
	input: CreateWorkshopProblemInput,
	userId: number
): Promise<WorkshopProblem> {
	const seed = randomBytes(8).toString("hex");
	return db.transaction(async (tx) => {
		const [created] = await tx
			.insert(workshopProblems)
			.values({
				title: input.title,
				problemType: input.problemType,
				timeLimit: input.timeLimit,
				memoryLimit: input.memoryLimit,
				seed,
				createdBy: userId,
			})
			.returning();
		await tx.insert(workshopProblemMembers).values({
			workshopProblemId: created.id,
			userId,
			role: "owner",
		});
		return created;
	});
}

/**
 * List workshop problems the user is a member of (owner or member).
 */
export async function listMyWorkshopProblems(userId: number): Promise<WorkshopProblem[]> {
	const memberRows = await db
		.select({ problemId: workshopProblemMembers.workshopProblemId })
		.from(workshopProblemMembers)
		.where(eq(workshopProblemMembers.userId, userId));
	const ids = memberRows.map((r) => r.problemId);
	if (ids.length === 0) return [];
	return db
		.select()
		.from(workshopProblems)
		.where(inArray(workshopProblems.id, ids))
		.orderBy(desc(workshopProblems.updatedAt));
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
