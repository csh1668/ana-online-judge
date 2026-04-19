"use server";

import { revalidatePath } from "next/cache";
import type { ProblemType } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";
import { enqueue } from "@/lib/queue/rating-queue";
import * as adminProblems from "@/lib/services/problems";
import { getProblemSolvers } from "@/lib/services/user-rating";

async function enqueueSolversRatingRecompute(problemId: number): Promise<void> {
	const solvers = await getProblemSolvers(problemId);
	for (const userId of solvers) {
		enqueue({ kind: "recomputeUserRating", userId });
	}
}

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

	// isPublic/maxScore/problemType 등이 변경되면 "푼 문제" 판정에 영향 가능.
	// 어떤 필드가 바뀌었는지 따지지 않고 단순히 solver 전원에 대해 재계산 enqueue (큐 dedup으로 중복 무해).
	await enqueueSolversRatingRecompute(id);

	revalidatePath("/admin/problems");
	revalidatePath(`/admin/problems/${id}`);
	revalidatePath("/problems");
	revalidatePath(`/problems/${id}`);

	return result;
}

export async function deleteProblem(...args: Parameters<typeof adminProblems.deleteProblem>) {
	await requireAdmin();
	// 삭제 cascade 발생 전에 solver 목록을 먼저 캡처
	const problemId = args[0];
	const solvers = await getProblemSolvers(problemId);

	const result = await adminProblems.deleteProblem(...args);

	// 삭제 후 영향 받은 사용자 레이팅 재계산
	for (const userId of solvers) {
		enqueue({ kind: "recomputeUserRating", userId });
	}

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

export async function getProblemStaff(...args: Parameters<typeof adminProblems.getProblemStaff>) {
	await requireAdmin();
	return adminProblems.getProblemStaff(...args);
}

export async function addProblemStaff(...args: Parameters<typeof adminProblems.addProblemStaff>) {
	await requireAdmin();
	const result = await adminProblems.addProblemStaff(...args);
	revalidatePath(`/admin/problems/${args[0]}`);
	return result;
}

export async function removeProblemStaff(
	...args: Parameters<typeof adminProblems.removeProblemStaff>
) {
	await requireAdmin();
	const result = await adminProblems.removeProblemStaff(...args);
	revalidatePath(`/admin/problems/${args[0]}`);
	return result;
}

export async function searchUsersForStaff(query: string, limit?: number) {
	await requireAdmin();
	const { searchUsers } = await import("@/lib/services/users");
	return searchUsers(query, limit);
}

export type GetAdminProblemsReturn = Awaited<ReturnType<typeof getAdminProblems>>;
export type AdminProblemListItem = GetAdminProblemsReturn["problems"][number];
export type CreateProblemReturn = Awaited<ReturnType<typeof createProblem>>;
export type UpdateProblemReturn = Awaited<ReturnType<typeof updateProblem>>;
export type DeleteProblemReturn = Awaited<ReturnType<typeof deleteProblem>>;
export type GetProblemForEditReturn = Awaited<ReturnType<typeof getProblemForEdit>>;
