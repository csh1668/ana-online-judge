"use server";

import { getSessionInfo } from "@/lib/auth-utils";
import * as svc from "@/lib/services/practices";

export async function getPractices(...args: Parameters<typeof svc.getPractices>) {
	return svc.getPractices(...args);
}

export async function getPracticeById(id: number) {
	return svc.getPracticeById(id);
}

export async function getPracticeQuotaStatus() {
	const { userId } = await getSessionInfo();
	if (!userId) return null;
	return svc.getPracticeQuotaStatus(userId);
}

export type GetPracticesReturn = Awaited<ReturnType<typeof getPractices>>;
export type PracticeListItem = GetPracticesReturn["practices"][number];
export type GetPracticeByIdReturn = Awaited<ReturnType<typeof getPracticeById>>;
