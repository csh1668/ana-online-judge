"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as adminContests from "@/lib/services/contests";

export async function createContest(...args: Parameters<typeof adminContests.createContest>) {
	await requireAdmin();
	const result = await adminContests.createContest(...args);
	revalidatePath("/contests");
	revalidatePath("/admin/contests");
	return result;
}

export async function updateContest(...args: Parameters<typeof adminContests.updateContest>) {
	await requireAdmin();
	const result = await adminContests.updateContest(...args);
	const id = args[0];
	revalidatePath("/contests");
	revalidatePath(`/contests/${id}`);
	revalidatePath("/admin/contests");
	revalidatePath(`/admin/contests/${id}`);
	return result;
}

export async function deleteContest(...args: Parameters<typeof adminContests.deleteContest>) {
	await requireAdmin();
	const result = await adminContests.deleteContest(...args);
	revalidatePath("/contests");
	revalidatePath("/admin/contests");
	return result;
}

export async function toggleFreezeState(
	...args: Parameters<typeof adminContests.toggleFreezeState>
) {
	await requireAdmin();
	const result = await adminContests.toggleFreezeState(...args);
	const contestId = args[0];
	revalidatePath(`/contests/${contestId}/scoreboard`);
	revalidatePath(`/admin/contests/${contestId}`);
	return result;
}
