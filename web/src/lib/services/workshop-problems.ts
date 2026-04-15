import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopProblem, workshopProblemMembers, workshopProblems } from "@/db/schema";

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
 * Get a workshop problem if the user is a member. Returns null otherwise.
 */
export async function getWorkshopProblemForUser(
	problemId: number,
	userId: number
): Promise<WorkshopProblem | null> {
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
	const [problem] = await db
		.select()
		.from(workshopProblems)
		.where(eq(workshopProblems.id, problemId))
		.limit(1);
	return problem ?? null;
}
