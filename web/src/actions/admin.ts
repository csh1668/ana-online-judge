"use server";

import { count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { problems, testcases, users, type ProblemType } from "@/db/schema";
import {
	uploadFile,
	deleteAllProblemFiles,
	generateCheckerPath,
	generateValidatorPath,
} from "@/lib/storage";
import { getRedisClient } from "@/lib/redis";

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
	problemType?: ProblemType;
}) {
	const user = await requireAdmin();

	const [newProblem] = await db
		.insert(problems)
		.values({
			...data,
			problemType: data.problemType ?? "icpc",
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
		problemType?: ProblemType;
		checkerPath?: string | null;
		validatorPath?: string | null;
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

	// Delete all files from MinIO first
	try {
		const deletedCount = await deleteAllProblemFiles(id);
		console.log(`Deleted ${deletedCount} files for problem ${id} from MinIO`);
	} catch (error) {
		console.error(`Failed to delete MinIO files for problem ${id}:`, error);
		// Continue with DB deletion even if MinIO deletion fails
	}

	// Delete from database (cascades to testcases)
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

// Checker upload
export async function uploadChecker(
	problemId: number,
	sourceCode: string,
	filename: string = "checker.cpp"
) {
	await requireAdmin();

	// Verify problem exists
	const [problem] = await db
		.select()
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);

	if (!problem) {
		throw new Error("Problem not found");
	}

	// Upload checker source to MinIO
	const checkerPath = generateCheckerPath(problemId, filename);
	await uploadFile(checkerPath, sourceCode, "text/plain");

	// Update problem with checker path
	const [updatedProblem] = await db
		.update(problems)
		.set({
			checkerPath,
			updatedAt: new Date(),
		})
		.where(eq(problems.id, problemId))
		.returning();

	revalidatePath(`/admin/problems/${problemId}`);

	return {
		success: true,
		checkerPath,
		problem: updatedProblem,
	};
}

// Validator upload
export async function uploadValidator(
	problemId: number,
	sourceCode: string,
	filename: string = "validator.cpp"
) {
	await requireAdmin();

	// Verify problem exists
	const [problem] = await db
		.select()
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);

	if (!problem) {
		throw new Error("Problem not found");
	}

	// Upload validator source to MinIO
	const validatorPath = generateValidatorPath(problemId, filename);
	await uploadFile(validatorPath, sourceCode, "text/plain");

	// Update problem with validator path
	const [updatedProblem] = await db
		.update(problems)
		.set({
			validatorPath,
			updatedAt: new Date(),
		})
		.where(eq(problems.id, problemId))
		.returning();

	revalidatePath(`/admin/problems/${problemId}`);

	return {
		success: true,
		validatorPath,
		problem: updatedProblem,
	};
}

// Validate testcases using validator
export async function validateTestcases(problemId: number) {
	await requireAdmin();

	// Get problem with validator path
	const [problem] = await db
		.select()
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);

	if (!problem) {
		throw new Error("Problem not found");
	}

	if (!problem.validatorPath) {
		throw new Error("No validator configured for this problem");
	}

	// Get all testcases for the problem
	const testcaseList = await db
		.select()
		.from(testcases)
		.where(eq(testcases.problemId, problemId))
		.orderBy(testcases.id);

	if (testcaseList.length === 0) {
		throw new Error("No testcases found for this problem");
	}

	// Create validation job with job_type for unified queue
	const validateJob = {
		job_type: "validate",
		problem_id: problemId,
		validator_path: problem.validatorPath,
		testcase_inputs: testcaseList.map((tc) => ({
			id: tc.id,
			input_path: tc.inputPath,
		})),
	};

	// Push to unified judge queue
	const redis = await getRedisClient();
	await redis.lpush("judge:queue", JSON.stringify(validateJob));

	return {
		success: true,
		message: `Validation job queued for ${testcaseList.length} testcases`,
		jobId: `validate:${problemId}`,
	};
}

// Get validation result
export async function getValidationResult(problemId: number) {
	await requireAdmin();

	const redis = await getRedisClient();
	const resultKey = `validate:result:${problemId}`;
	const result = await redis.get(resultKey);

	if (!result) {
		return null;
	}

	return JSON.parse(result);
}

export type GetAdminProblemsReturn = Awaited<ReturnType<typeof getAdminProblems>>;
export type AdminProblemListItem = GetAdminProblemsReturn["problems"][number];
export type CreateProblemReturn = Awaited<ReturnType<typeof createProblem>>;
export type UpdateProblemReturn = Awaited<ReturnType<typeof updateProblem>>;
export type DeleteProblemReturn = Awaited<ReturnType<typeof deleteProblem>>;
export type GetProblemForEditReturn = Awaited<ReturnType<typeof getProblemForEdit>>;
export type GetTestcasesReturn = Awaited<ReturnType<typeof getTestcases>>;
export type CreateTestcaseReturn = Awaited<ReturnType<typeof createTestcase>>;
export type DeleteTestcaseReturn = Awaited<ReturnType<typeof deleteTestcase>>;
export type GetAdminUsersReturn = Awaited<ReturnType<typeof getAdminUsers>>;
export type AdminUserListItem = GetAdminUsersReturn["users"][number];
export type UpdateUserRoleReturn = Awaited<ReturnType<typeof updateUserRole>>;
export type UploadCheckerReturn = Awaited<ReturnType<typeof uploadChecker>>;
export type UploadValidatorReturn = Awaited<ReturnType<typeof uploadValidator>>;
export type ValidateTestcasesReturn = Awaited<ReturnType<typeof validateTestcases>>;
export type GetValidationResultReturn = Awaited<ReturnType<typeof getValidationResult>>;
