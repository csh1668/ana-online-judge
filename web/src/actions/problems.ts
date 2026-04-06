"use server";

import { getSessionInfo } from "@/lib/auth-utils";
import * as problemsService from "@/lib/services/problems";

export async function getProblems(options?: Parameters<typeof problemsService.getProblems>[0]) {
	const { isAdmin } = await getSessionInfo();
	return problemsService.getProblems(options, { isAdmin });
}

export async function getProblemById(id: number, contestId?: number) {
	const { userId, isAdmin } = await getSessionInfo();
	return problemsService.getProblemById(id, contestId, {
		userId: userId ?? undefined,
		isAdmin,
	});
}

export type GetProblemsReturn = Awaited<ReturnType<typeof getProblems>>;
export type ProblemListItem = GetProblemsReturn["problems"][number];
export type GetProblemByIdReturn = Awaited<ReturnType<typeof getProblemById>>;
