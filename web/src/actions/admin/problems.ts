"use server";

import { count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ProblemType, problems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";
import { deleteAllProblemFiles, uploadFile } from "@/lib/storage";

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
	// File 객체는 DB 필드가 아니므로 제거
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

export type GetAdminProblemsReturn = Awaited<ReturnType<typeof getAdminProblems>>;
export type AdminProblemListItem = GetAdminProblemsReturn["problems"][number];
export type CreateProblemReturn = Awaited<ReturnType<typeof createProblem>>;
export type UpdateProblemReturn = Awaited<ReturnType<typeof updateProblem>>;
export type DeleteProblemReturn = Awaited<ReturnType<typeof deleteProblem>>;
export type GetProblemForEditReturn = Awaited<ReturnType<typeof getProblemForEdit>>;
