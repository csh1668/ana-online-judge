"use server";

import { revalidatePath } from "next/cache";
import type { ProblemType } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";
import * as adminProblems from "@/lib/services/problems";

export async function getAdminProblems(...args: Parameters<typeof adminProblems.getAdminProblems>) {
	await requireAdmin();
	return adminProblems.getAdminProblems(...args);
}

// createProblem/updateProblem have different signatures (File vs Buffer),
// so they keep explicit types at the server action boundary.
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

	const referenceCodeBuffer = data.referenceCodeFile
		? Buffer.from(await data.referenceCodeFile.arrayBuffer())
		: null;
	const solutionCodeBuffer = data.solutionCodeFile
		? Buffer.from(await data.solutionCodeFile.arrayBuffer())
		: null;

	const result = await adminProblems.createProblem(
		{
			...data,
			referenceCodeBuffer,
			solutionCodeBuffer,
		},
		parseInt(user.id, 10)
	);

	revalidatePath("/admin/problems");
	revalidatePath("/problems");

	return result;
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

	const referenceCodeBuffer = data.referenceCodeFile
		? Buffer.from(await data.referenceCodeFile.arrayBuffer())
		: null;
	const solutionCodeBuffer = data.solutionCodeFile
		? Buffer.from(await data.solutionCodeFile.arrayBuffer())
		: null;

	const { referenceCodeFile: _rf, solutionCodeFile: _sf, ...rest } = data;

	const result = await adminProblems.updateProblem(id, {
		...rest,
		referenceCodeBuffer,
		solutionCodeBuffer,
	});

	revalidatePath("/admin/problems");
	revalidatePath(`/admin/problems/${id}`);
	revalidatePath("/problems");
	revalidatePath(`/problems/${id}`);

	return result;
}

export async function deleteProblem(...args: Parameters<typeof adminProblems.deleteProblem>) {
	await requireAdmin();
	const result = await adminProblems.deleteProblem(...args);

	revalidatePath("/admin/problems");
	revalidatePath("/problems");

	return result;
}

export async function getProblemForEdit(
	...args: Parameters<typeof adminProblems.getProblemForEdit>
) {
	await requireAdmin();
	return adminProblems.getProblemForEdit(...args);
}

export type GetAdminProblemsReturn = Awaited<ReturnType<typeof getAdminProblems>>;
export type AdminProblemListItem = GetAdminProblemsReturn["problems"][number];
export type CreateProblemReturn = Awaited<ReturnType<typeof createProblem>>;
export type UpdateProblemReturn = Awaited<ReturnType<typeof updateProblem>>;
export type DeleteProblemReturn = Awaited<ReturnType<typeof deleteProblem>>;
export type GetProblemForEditReturn = Awaited<ReturnType<typeof getProblemForEdit>>;
