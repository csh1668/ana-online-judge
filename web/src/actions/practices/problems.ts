"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-utils";
import * as svc from "@/lib/services/practice-problems";

export async function addProblemToPractice(practiceId: number, problemId: number) {
	const { userId } = await requireAuth();
	const result = await svc.addProblemToPractice(userId, practiceId, problemId);
	revalidatePath(`/practices/${practiceId}`);
	revalidatePath(`/practices/${practiceId}/edit`);
	return result;
}

export async function removeProblemFromPractice(practiceId: number, practiceProblemId: number) {
	const { userId } = await requireAuth();
	const result = await svc.removeProblemFromPractice(userId, practiceId, practiceProblemId);
	revalidatePath(`/practices/${practiceId}`);
	revalidatePath(`/practices/${practiceId}/edit`);
	return result;
}
