"use server";

import { getSessionInfo } from "@/lib/auth-utils";
import * as submissionsService from "@/lib/services/submissions";

export async function getSubmissions(
	options?: Parameters<typeof submissionsService.getSubmissions>[0]
) {
	const { userId: currentUserId, isAdmin } = await getSessionInfo();
	return submissionsService.getSubmissions(options, { currentUserId, isAdmin });
}

export async function getSubmissionById(id: number) {
	const { userId: currentUserId, isAdmin } = await getSessionInfo();
	return submissionsService.getSubmissionById(id, { currentUserId, isAdmin });
}

export async function getUserProblemStatuses(
	...args: Parameters<typeof submissionsService.getUserProblemStatuses>
) {
	return submissionsService.getUserProblemStatuses(...args);
}

// Re-export types
export type GetSubmissionsReturn = Awaited<ReturnType<typeof getSubmissions>>;
export type SubmissionListItem = GetSubmissionsReturn["submissions"][number];
export type GetSubmissionByIdReturn = Awaited<ReturnType<typeof getSubmissionById>>;
export type SubmissionDetail = NonNullable<GetSubmissionByIdReturn>;
