"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as sourcesService from "@/lib/services/sources";

function adminUserId(user: { id?: string }) {
	return user.id ? Number.parseInt(user.id, 10) : null;
}

export async function createSourceAction(input: Parameters<typeof sourcesService.createSource>[0]) {
	const user = await requireAdmin();
	const row = await sourcesService.createSource(input, adminUserId(user));
	revalidatePath("/sources");
	revalidatePath("/admin/sources");
	if (input.parentId) revalidatePath(`/sources/${input.parentId}`);
	return row;
}

export async function updateSourceAction(
	id: number,
	patch: Parameters<typeof sourcesService.updateSource>[1]
) {
	const user = await requireAdmin();
	const row = await sourcesService.updateSource(id, patch, adminUserId(user));
	revalidatePath("/sources");
	revalidatePath("/admin/sources");
	revalidatePath(`/sources/${id}`);
	return row;
}

export async function deleteSourceAction(id: number) {
	const user = await requireAdmin();
	const res = await sourcesService.deleteSource(id, adminUserId(user));
	revalidatePath("/sources");
	revalidatePath("/admin/sources");
	return res;
}

export async function previewDeleteImpactAction(id: number) {
	await requireAdmin();
	return sourcesService.previewDeleteImpact(id);
}

export async function listChildrenAction(parentId: number | null) {
	await requireAdmin();
	return parentId === null
		? sourcesService.listRootSources()
		: sourcesService.listChildren(parentId);
}

export async function searchSourcesAction(query: string) {
	await requireAdmin();
	return sourcesService.searchSources(query);
}

export async function getBreadcrumbAction(id: number) {
	await requireAdmin();
	return sourcesService.getBreadcrumb(id);
}
