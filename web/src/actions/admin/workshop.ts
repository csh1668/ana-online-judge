"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as adminSvc from "@/lib/services/workshop-admin";
import * as publishSvc from "@/lib/services/workshop-publish";
import * as readinessSvc from "@/lib/services/workshop-publish-readiness";

export async function listAllWorkshopProblems(q?: string, options?: { published?: boolean }) {
	await requireAdmin();
	return adminSvc.listAllWorkshopProblemsForAdmin(q, options);
}

export async function getWorkshopProblemAdminDetail(workshopProblemId: number) {
	await requireAdmin();
	return adminSvc.getAdminWorkshopProblemDetail(workshopProblemId);
}

export async function getWorkshopReadiness(workshopProblemId: number) {
	await requireAdmin();
	return readinessSvc.computePublishReadiness(workshopProblemId);
}

export async function publishWorkshopProblem(workshopProblemId: number) {
	await requireAdmin();
	const result = await publishSvc.publishWorkshopAsNewProblem({ workshopProblemId });
	revalidatePath("/admin/workshop");
	revalidatePath(`/admin/workshop/${workshopProblemId}`);
	revalidatePath("/admin/problems");
	revalidatePath("/problems");
	revalidatePath(`/workshop/${workshopProblemId}`);
	return result;
}

export async function republishWorkshopProblem(workshopProblemId: number) {
	await requireAdmin();
	const result = await publishSvc.republishWorkshopToExistingProblem({
		workshopProblemId,
	});
	revalidatePath("/admin/workshop");
	revalidatePath(`/admin/workshop/${workshopProblemId}`);
	revalidatePath("/admin/problems");
	revalidatePath(`/admin/problems/${result.problemId}`);
	revalidatePath("/problems");
	revalidatePath(`/problems/${result.problemId}`);
	revalidatePath(`/workshop/${workshopProblemId}`);
	return result;
}

export type AdminWorkshopListReturn = Awaited<ReturnType<typeof listAllWorkshopProblems>>;
export type AdminWorkshopDetailReturn = Awaited<ReturnType<typeof getWorkshopProblemAdminDetail>>;
export type WorkshopReadinessReturn = Awaited<ReturnType<typeof getWorkshopReadiness>>;
export type PublishReturn = Awaited<ReturnType<typeof publishWorkshopProblem>>;
