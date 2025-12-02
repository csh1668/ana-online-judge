"use server";

import { count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { problems, testcases, users } from "@/db/schema";

// Check if user is admin
async function requireAdmin() {
	const session = await auth();
	if (!session?.user || session.user.role !== "admin") {
		throw new Error("Unauthorized");
	}
	return session.user;
}

// Problems CRUD
export async function getAdminProblems(options?: { page?: number; limit?: number }) {
	await requireAdmin();

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const [problemsList, totalResult] = await Promise.all([
		db
			.select({
				id: problems.id,
				title: problems.title,
				isPublic: problems.isPublic,
				createdAt: problems.createdAt,
			})
			.from(problems)
			.orderBy(desc(problems.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(problems),
	]);

	return {
		problems: problemsList,
		total: totalResult[0].count,
	};
}

export async function createProblem(data: {
	title: string;
	content: string;
	timeLimit: number;
	memoryLimit: number;
	isPublic: boolean;
}) {
	const user = await requireAdmin();

	const [newProblem] = await db
		.insert(problems)
		.values({
			...data,
			authorId: parseInt(user.id, 10),
		})
		.returning();

	revalidatePath("/admin/problems");
	revalidatePath("/problems");

	return newProblem;
}

export async function updateProblem(
	id: number,
	data: {
		title?: string;
		content?: string;
		timeLimit?: number;
		memoryLimit?: number;
		isPublic?: boolean;
	}
) {
	await requireAdmin();

	const [updatedProblem] = await db
		.update(problems)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(problems.id, id))
		.returning();

	revalidatePath("/admin/problems");
	revalidatePath(`/admin/problems/${id}`);
	revalidatePath("/problems");
	revalidatePath(`/problems/${id}`);

	return updatedProblem;
}

export async function deleteProblem(id: number) {
	await requireAdmin();

	await db.delete(problems).where(eq(problems.id, id));

	revalidatePath("/admin/problems");
	revalidatePath("/problems");

	return { success: true };
}

export async function getProblemForEdit(id: number) {
	await requireAdmin();

	const [problem] = await db.select().from(problems).where(eq(problems.id, id)).limit(1);

	return problem || null;
}

// Testcases CRUD
export async function getTestcases(problemId: number) {
	await requireAdmin();

	return db
		.select()
		.from(testcases)
		.where(eq(testcases.problemId, problemId))
		.orderBy(testcases.id);
}

export async function createTestcase(data: {
	problemId: number;
	inputPath: string;
	outputPath: string;
	subtaskGroup?: number;
	isHidden?: boolean;
	score?: number;
}) {
	await requireAdmin();

	const [newTestcase] = await db.insert(testcases).values(data).returning();

	revalidatePath(`/admin/problems/${data.problemId}/testcases`);

	return newTestcase;
}

export async function deleteTestcase(id: number, problemId: number) {
	await requireAdmin();

	await db.delete(testcases).where(eq(testcases.id, id));

	revalidatePath(`/admin/problems/${problemId}/testcases`);

	return { success: true };
}

// Users management
export async function getAdminUsers(options?: { page?: number; limit?: number }) {
	await requireAdmin();

	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;

	const [usersList, totalResult] = await Promise.all([
		db
			.select({
				id: users.id,
				email: users.email,
				name: users.name,
				role: users.role,
				rating: users.rating,
				createdAt: users.createdAt,
			})
			.from(users)
			.orderBy(desc(users.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(users),
	]);

	return {
		users: usersList,
		total: totalResult[0].count,
	};
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
	await requireAdmin();

	const [updatedUser] = await db
		.update(users)
		.set({ role, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning();

	revalidatePath("/admin/users");

	return updatedUser;
}
