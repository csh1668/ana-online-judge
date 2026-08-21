"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as dlq from "@/lib/services/judge-dlq";

export async function listDeadLetterJobsAction() {
	await requireAdmin();
	return dlq.listDeadLetterJobs();
}

export async function countDeadLetterJobsAction() {
	await requireAdmin();
	return dlq.countDeadLetterJobs();
}

export async function requeueDeadLetterJobAction(
	...args: Parameters<typeof dlq.requeueDeadLetterJob>
) {
	await requireAdmin();
	const result = await dlq.requeueDeadLetterJob(...args);
	revalidatePath("/admin/submissions");
	return result;
}

export async function deleteDeadLetterJobAction(
	...args: Parameters<typeof dlq.deleteDeadLetterJob>
) {
	await requireAdmin();
	const result = await dlq.deleteDeadLetterJob(...args);
	revalidatePath("/admin/submissions");
	return result;
}

export type DeadLetterEntry = Awaited<ReturnType<typeof listDeadLetterJobsAction>>[number];
