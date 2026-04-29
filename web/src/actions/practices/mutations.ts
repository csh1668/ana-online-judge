"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-utils";
import * as svc from "@/lib/services/practices";
import { assertTurnstile } from "@/lib/turnstile-guard";

export async function createPractice(
	data: Parameters<typeof svc.createPractice>[1],
	turnstileToken: string
) {
	await assertTurnstile(turnstileToken);
	const { userId } = await requireAuth();
	const result = await svc.createPractice(userId, data);
	revalidatePath("/practices");
	return result;
}

export async function updatePractice(
	practiceId: number,
	data: Parameters<typeof svc.updatePractice>[2]
) {
	const { userId } = await requireAuth();
	const result = await svc.updatePractice(userId, practiceId, data);
	revalidatePath("/practices");
	revalidatePath(`/practices/${practiceId}`);
	revalidatePath(`/practices/${practiceId}/edit`);
	revalidatePath("/admin/practices");
	return result;
}

export async function deletePractice(practiceId: number) {
	const { userId } = await requireAuth();
	const result = await svc.deletePractice(userId, practiceId);
	revalidatePath("/practices");
	revalidatePath("/admin/practices");
	return result;
}
