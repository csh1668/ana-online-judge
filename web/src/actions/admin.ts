"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contestProblems, type ProblemType, problems, testcases, users } from "@/db/schema";
import { recalculateContestBonus } from "@/lib/anigma-bonus";
import { requireAdmin } from "@/lib/auth-utils";
import { getRedisClient } from "@/lib/redis";
import {
	deleteAllProblemFiles,
	generateCheckerPath,
	generateValidatorPath,
	uploadFile,
} from "@/lib/storage";

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
				judgeAvailable: problems.judgeAvailable,
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
	id?: number;
	title: string;
	content: string;
	timeLimit: number;
	memoryLimit: number;
	maxScore: number;
	isPublic: boolean;
	judgeAvailable?: boolean;
	problemType?: ProblemType;
	allowedLanguages?: string[] | null;
	referenceCodeFile?: File | null;
	solutionCodeFile?: File | null;
}) {
	const user = await requireAdmin();

	// ID가 지정된 경우 해당 ID가 이미 존재하는지 확인
	if (data.id !== undefined) {
		const existing = await db.select().from(problems).where(eq(problems.id, data.id)).limit(1);
		if (existing.length > 0) {
			throw new Error(`문제 ID ${data.id}는 이미 사용 중입니다.`);
		}
	}

	const tempId = data.id || Date.now();

	// ANIGMA 문제: 코드 A (문제 제공 코드) 업로드
	let referenceCodePath: string | null = null;
	if (data.problemType === "anigma" && data.referenceCodeFile) {
		const buffer = Buffer.from(await data.referenceCodeFile.arrayBuffer());
		referenceCodePath = `problems/${tempId}/reference_code.zip`;
		await uploadFile(referenceCodePath, buffer, "application/zip");
	}

	// ANIGMA 문제: 코드 B (정답 코드) 업로드
	let solutionCodePath: string | null = null;
	if (data.problemType === "anigma" && data.solutionCodeFile) {
		const buffer = Buffer.from(await data.solutionCodeFile.arrayBuffer());
		solutionCodePath = `problems/${tempId}/solution_code.zip`;
		await uploadFile(solutionCodePath, buffer, "application/zip");
	}

	const [newProblem] = await db
		.insert(problems)
		.values({
			...(data.id !== undefined && { id: data.id }),
			title: data.title,
			content: data.content,
			timeLimit: data.timeLimit,
			memoryLimit: data.memoryLimit,
			maxScore: data.maxScore,
			isPublic: data.isPublic,
			judgeAvailable: data.judgeAvailable ?? true,
			problemType: data.problemType ?? "icpc",
			allowedLanguages: data.allowedLanguages ?? null,
			referenceCodePath: referenceCodePath,
			solutionCodePath: solutionCodePath,
			authorId: parseInt(user.id, 10),
		})
		.returning();

	// 커스텀 ID를 사용한 경우 sequence를 업데이트하여 향후 충돌 방지
	if (data.id !== undefined) {
		await db.execute(
			sql`SELECT setval(pg_get_serial_sequence('problems', 'id'), GREATEST(${data.id}, (SELECT COALESCE(MAX(id), 0) FROM problems)))`
		);
	}

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
		maxScore?: number;
		isPublic?: boolean;
		judgeAvailable?: boolean;
		problemType?: ProblemType;
		checkerPath?: string | null;
		validatorPath?: string | null;
		allowedLanguages?: string[] | null;
		referenceCodeFile?: File | null;
		solutionCodeFile?: File | null;
	}
) {
	await requireAdmin();

	// ANIGMA 문제: 코드 A (문제 제공 코드) 업로드
	let referenceCodePath: string | undefined;
	if (data.problemType === "anigma" && data.referenceCodeFile) {
		const buffer = Buffer.from(await data.referenceCodeFile.arrayBuffer());
		referenceCodePath = `problems/${id}/reference_code.zip`;
		await uploadFile(referenceCodePath, buffer, "application/zip");
	}

	// ANIGMA 문제: 코드 B (정답 코드) 업로드
	let solutionCodePath: string | undefined;
	if (data.problemType === "anigma" && data.solutionCodeFile) {
		const buffer = Buffer.from(await data.solutionCodeFile.arrayBuffer());
		solutionCodePath = `problems/${id}/solution_code.zip`;
		await uploadFile(solutionCodePath, buffer, "application/zip");
	}

	interface UpdateData {
		title?: string;
		content?: string;
		timeLimit?: number;
		memoryLimit?: number;
		maxScore?: number;
		isPublic?: boolean;
		judgeAvailable?: boolean;
		problemType?: ProblemType;
		checkerPath?: string | null;
		validatorPath?: string | null;
		allowedLanguages?: string[] | null;
		referenceCodePath?: string | null;
		solutionCodePath?: string | null;
		updatedAt: Date;
	}

	const updateData: UpdateData = { ...data, updatedAt: new Date() };
	if (referenceCodePath !== undefined) {
		updateData.referenceCodePath = referenceCodePath;
	}
	if (solutionCodePath !== undefined) {
		updateData.solutionCodePath = solutionCodePath;
	}
	// File 객체는 DB 필드가 아니므로 제거 (타입에서 제외했으므로 delete 불필요)
	// @ts-expect-error - Removing non-DB fields
	delete updateData.referenceCodeFile;
	// @ts-expect-error - Removing non-DB fields
	delete updateData.solutionCodeFile;

	const [updatedProblem] = await db
		.update(problems)
		.set(updateData)
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
				username: users.username,
				email: users.email,
				name: users.name,
				role: users.role,
				rating: users.rating,
				playgroundAccess: users.playgroundAccess,
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

export async function togglePlaygroundAccess(userId: number, hasAccess: boolean) {
	await requireAdmin();

	const [updatedUser] = await db
		.update(users)
		.set({ playgroundAccess: hasAccess, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning();

	revalidatePath("/admin/users");

	return updatedUser;
}

export async function deleteUser(userId: number) {
	const currentUser = await requireAdmin();

	// 자기 자신을 삭제하지 못하도록 방지
	if (parseInt(currentUser.id, 10) === userId) {
		throw new Error("자기 자신을 삭제할 수 없습니다.");
	}

	// 사용자 삭제 (cascade로 관련 데이터 자동 삭제)
	await db.delete(users).where(eq(users.id, userId));

	revalidatePath("/admin/users");

	return { success: true };
}

// Checker upload
export async function uploadChecker(
	problemId: number,
	sourceCode: string,
	filename: string = "checker.cpp"
) {
	await requireAdmin();

	// Verify problem exists
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);

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
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);

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
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);

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
export type TogglePlaygroundAccessReturn = Awaited<ReturnType<typeof togglePlaygroundAccess>>;
export type DeleteUserReturn = Awaited<ReturnType<typeof deleteUser>>;
export type UploadCheckerReturn = Awaited<ReturnType<typeof uploadChecker>>;
export type UploadValidatorReturn = Awaited<ReturnType<typeof uploadValidator>>;
export type ValidateTestcasesReturn = Awaited<ReturnType<typeof validateTestcases>>;
export type GetValidationResultReturn = Awaited<ReturnType<typeof getValidationResult>>;

// Refresh contest scoreboard (recalculate Anigma bonus scores)
export async function refreshContestScoreboard(contestId: number) {
	await requireAdmin();

	// Get all Anigma problems in this contest
	const anigmaProblems = await db
		.select({
			problemId: contestProblems.problemId,
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(and(eq(contestProblems.contestId, contestId), eq(problems.problemType, "anigma")));

	if (anigmaProblems.length === 0) {
		return {
			success: false,
			message: "No Anigma problems found in this contest",
		};
	}

	// Recalculate bonus for each Anigma problem
	const results = [];
	for (const { problemId } of anigmaProblems) {
		try {
			await recalculateContestBonus(contestId, problemId);
			results.push({ problemId, success: true });
		} catch (error) {
			console.error(`Failed to recalculate bonus for problem ${problemId}:`, error);
			results.push({ problemId, success: false, error: String(error) });
		}
	}

	// Revalidate contest pages
	revalidatePath(`/contests/${contestId}`);
	revalidatePath(`/contests/${contestId}/scoreboard`);

	const successCount = results.filter((r) => r.success).length;
	const failCount = results.filter((r) => !r.success).length;

	return {
		success: true,
		message: `Scoreboard refreshed: ${successCount} problems updated, ${failCount} failed`,
		results,
	};
}

export type RefreshContestScoreboardReturn = Awaited<ReturnType<typeof refreshContestScoreboard>>;
