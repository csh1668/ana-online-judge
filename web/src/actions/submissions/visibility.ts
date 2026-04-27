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

		const owner = await submissionsService.getSubmissionOwnerInfo(submissionId);
		if (!owner) return { error: "제출을 찾을 수 없습니다." };
		if (!isAdmin && owner.userId !== userId) return { error: "권한이 없습니다." };
		if (owner.contestId !== null) {
			return { error: "대회 제출의 공개 설정은 변경할 수 없습니다." };
		}

		const result = await submissionsService.updateSubmissionVisibility(submissionId, visibility);
		if (!result) return { error: "제출을 찾을 수 없습니다." };

		revalidatePath(`/submissions/${submissionId}`);
		revalidatePath("/submissions");
		revalidatePath(`/problems/${result.problemId}`);
		revalidatePath(`/profile/${result.ownerUsername}`);
		return { success: true };
	} catch (error) {
		console.error("updateSubmissionVisibility error", error);
		return { error: "변경 중 오류가 발생했어요." };
	}
}
