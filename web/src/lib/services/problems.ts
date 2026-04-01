import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type ProblemType, problems } from "@/db/schema";
import { deleteAllProblemFiles, uploadFile } from "@/lib/storage";

export async function getAdminProblems(options?: { page?: number; limit?: number }) {
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

export async function createProblem(
	data: {
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
		referenceCodeBuffer?: Buffer | null;
		solutionCodeBuffer?: Buffer | null;
	},
	authorId: number
) {
	if (data.id !== undefined) {
		const existing = await db.select().from(problems).where(eq(problems.id, data.id)).limit(1);
		if (existing.length > 0) {
			throw new Error(`문제 ID ${data.id}는 이미 사용 중입니다.`);
		}
	}

	const tempId = data.id || Date.now();

	let referenceCodePath: string | null = null;
	if (data.problemType === "anigma" && data.referenceCodeBuffer) {
		referenceCodePath = `problems/${tempId}/reference_code.zip`;
		await uploadFile(referenceCodePath, data.referenceCodeBuffer, "application/zip");
	}

	let solutionCodePath: string | null = null;
	if (data.problemType === "anigma" && data.solutionCodeBuffer) {
		solutionCodePath = `problems/${tempId}/solution_code.zip`;
		await uploadFile(solutionCodePath, data.solutionCodeBuffer, "application/zip");
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
			judgeAvailable: data.judgeAvailable ?? false,
			problemType: data.problemType ?? "icpc",
			allowedLanguages: data.allowedLanguages ?? null,
			referenceCodePath: referenceCodePath,
			solutionCodePath: solutionCodePath,
			authorId,
		})
		.returning();

	if (data.id !== undefined) {
		await db.execute(
			sql`SELECT setval(pg_get_serial_sequence('problems', 'id'), GREATEST(${data.id}, (SELECT COALESCE(MAX(id), 0) FROM problems)))`
		);
	}

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
		referenceCodeBuffer?: Buffer | null;
		solutionCodeBuffer?: Buffer | null;
	}
) {
	let referenceCodePath: string | undefined;
	if (data.problemType === "anigma" && data.referenceCodeBuffer) {
		referenceCodePath = `problems/${id}/reference_code.zip`;
		await uploadFile(referenceCodePath, data.referenceCodeBuffer, "application/zip");
	}

	let solutionCodePath: string | undefined;
	if (data.problemType === "anigma" && data.solutionCodeBuffer) {
		solutionCodePath = `problems/${id}/solution_code.zip`;
		await uploadFile(solutionCodePath, data.solutionCodeBuffer, "application/zip");
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

	const { referenceCodeBuffer: _rc, solutionCodeBuffer: _sc, ...dbFields } = data;
	const updateData: UpdateData = { ...dbFields, updatedAt: new Date() };
	if (referenceCodePath !== undefined) {
		updateData.referenceCodePath = referenceCodePath;
	}
	if (solutionCodePath !== undefined) {
		updateData.solutionCodePath = solutionCodePath;
	}

	const [updatedProblem] = await db
		.update(problems)
		.set(updateData)
		.where(eq(problems.id, id))
		.returning();

	return updatedProblem;
}

export async function deleteProblem(id: number) {
	try {
		const deletedCount = await deleteAllProblemFiles(id);
		console.log(`Deleted ${deletedCount} files for problem ${id} from MinIO`);
	} catch (error) {
		console.error(`Failed to delete MinIO files for problem ${id}:`, error);
	}

	await db.delete(problems).where(eq(problems.id, id));

	return { success: true };
}

export async function getProblemForEdit(id: number) {
	const [problem] = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
	return problem || null;
}
