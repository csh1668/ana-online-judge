"use server";

import { revalidatePath } from "next/cache";
import { type SubmissionVisibility, submissionVisibilityEnum } from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";
import * as submissionsService from "@/lib/services/submissions";

export async function updateSubmissionVisibility(
	submissionId: number,
	visibility: SubmissionVisibility
) {
	try {
		const allowed = submissionVisibilityEnum.enumValues as readonly SubmissionVisibility[];
		if (!allowed.includes(visibility)) {
			return { error: "잘못된 공개 설정입니다." };
		}
		const { userId, isAdmin } = await getSessionInfo();
		if (!userId) return { error: "로그인이 필요합니다." };
		const result = await submissionsService.updateSubmissionVisibility(submissionId, visibility, {
			currentUserId: userId,
			isAdmin,
		});
		if ("error" in result) return result;
		revalidatePath(`/submissions/${submissionId}`);
		return result;
	} catch (error) {
		console.error("updateSubmissionVisibility error", error);
		return { error: "변경 중 오류가 발생했어요." };
	}
}
