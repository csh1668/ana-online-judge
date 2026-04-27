"use server";

import { revalidatePath } from "next/cache";
import { type SubmissionVisibility, submissionVisibilityEnum } from "@/db/schema";
import { requireAuth } from "@/lib/auth-utils";
import { getUserRanking as getUserRankingService } from "@/lib/services/ranking";
import { getUserHeatmap, getUserLanguageStats, getUserStats } from "@/lib/services/user-stats";
import {
	getUserByUsername,
	updateUserDefaultVisibility as updateUserDefaultVisibilityService,
	updateUserProfile as updateUserProfileService,
} from "@/lib/services/users";

export async function getProfile(username: string) {
	return getUserByUsername(username);
}

export async function getProfileStats(userId: number) {
	return getUserStats(userId);
}

export async function getProfileHeatmap(userId: number) {
	return getUserHeatmap(userId);
}

export async function getProfileLanguageStats(userId: number) {
	return getUserLanguageStats(userId);
}

export async function updateProfile(data: {
	name?: string;
	bio?: string | null;
	avatarUrl?: string | null;
}) {
	const { userId } = await requireAuth();
	const result = await updateUserProfileService(userId, data);
	revalidatePath(`/profile`);
	return result;
}

export async function getUserRanking(options?: { page?: number; limit?: number }) {
	return getUserRankingService(options);
}

export async function updateDefaultSubmissionVisibility(visibility: SubmissionVisibility) {
	try {
		const { session, userId } = await requireAuth();
		const allowed = submissionVisibilityEnum.enumValues as readonly SubmissionVisibility[];
		if (!allowed.includes(visibility)) {
			return { error: "잘못된 공개 설정입니다." };
		}
		await updateUserDefaultVisibilityService(userId, visibility);
		const username = session.user?.username;
		if (username) {
			revalidatePath(`/profile/${username}`);
			revalidatePath(`/profile/${username}/settings`);
		}
		return { success: true };
	} catch (error) {
		console.error("updateDefaultSubmissionVisibility error", error);
		return { error: "저장 중 오류가 발생했어요." };
	}
}
