"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as svc from "@/lib/services/admin-submissions";

export async function listAdminSubmissionsAction(
	...args: Parameters<typeof svc.listAdminSubmissions>
) {
	await requireAdmin();
	return svc.listAdminSubmissions(...args);
}

export async function countAdminSubmissionsAction(filter: svc.AdminSubmissionFilter) {
	await requireAdmin();
	return svc.countSubmissionsByFilter(filter);
}

export async function rejudgeByIdsAction(ids: number[]) {
	await requireAdmin();
	const result = await svc.rejudgeSubmissionsByIds(ids);
	revalidatePath("/admin/submissions");
	return result;
}

export async function rejudgeByFilterAction(filter: svc.AdminSubmissionFilter) {
	await requireAdmin();
	const result = await svc.rejudgeSubmissionsByFilter(filter);
	revalidatePath("/admin/submissions");
	return result;
}

export type RejudgeResult = svc.RejudgeResult;

export async function deleteByIdsAction(ids: number[]) {
	await requireAdmin();
	const result = await svc.deleteSubmissionsByIds(ids);
	revalidatePath("/admin/submissions");
	revalidatePath("/submissions");
	return result;
}

export async function deleteByFilterAction(filter: svc.AdminSubmissionFilter) {
	await requireAdmin();
	const result = await svc.deleteSubmissionsByFilter(filter);
	revalidatePath("/admin/submissions");
	revalidatePath("/submissions");
	return result;
}

export type DeleteResult = svc.DeleteResult;
