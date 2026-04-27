"use server";

import { getSessionInfo } from "@/lib/auth-utils";
import * as submissionsService from "@/lib/services/submissions";
import {
	augmentSubmissionsWithCodeAccess,
	buildSubmissionListVisibilityWhere,
	checkSubmissionCodeAccess,
	getAccessibleContestIds,
} from "@/lib/submission-access";

type ListOptions = Omit<
	Parameters<typeof submissionsService.getSubmissions>[0] & object,
	"extraWhere"
> & { excludeContestSubmissions?: boolean };

export async function getSubmissions(options?: ListOptions) {
	const { userId: viewerUserId, isAdmin } = await getSessionInfo();
	const excludeContestSubmissions = options?.excludeContestSubmissions ?? false;

	let extraWhere: ReturnType<typeof buildSubmissionListVisibilityWhere> | undefined;
	if (!isAdmin) {
		const accessibleContestIds = viewerUserId ? await getAccessibleContestIds(viewerUserId) : [];
		extraWhere = buildSubmissionListVisibilityWhere({
			viewerUserId,
			accessibleContestIds,
			excludeContestSubmissions,
		});
	}

	const { excludeContestSubmissions: _x, ...rest } = options ?? {};
	const result = await submissionsService.getSubmissions({ ...rest, extraWhere });

	const augmented = await augmentSubmissionsWithCodeAccess(result.submissions, {
		viewerUserId,
		isAdmin,
	});

	return { submissions: augmented, total: result.total };
}

export async function getSubmissionById(id: number) {
	const raw = await submissionsService.getSubmissionById(id);
	if (!raw) return null;

	const { userId: viewerUserId, isAdmin } = await getSessionInfo();
	const access = await checkSubmissionCodeAccess({
		submission: {
			userId: raw.userId,
			problemId: raw.problemId,
			contestId: raw.contestId,
			visibility: raw.visibility,
			verdict: raw.verdict,
		},
		viewerUserId,
		isAdmin,
	});

	const codeVisible = access.allowed;
	return {
		...raw,
		code: codeVisible ? raw.code : "",
		errorMessage: codeVisible ? raw.errorMessage : null,
		codeAccess: access,
	};
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
