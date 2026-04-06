"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-utils";
import { getUserRanking as getUserRankingService } from "@/lib/services/ranking";
import { getUserHeatmap, getUserLanguageStats, getUserStats } from "@/lib/services/user-stats";
import {
	getUserByUsername,
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
