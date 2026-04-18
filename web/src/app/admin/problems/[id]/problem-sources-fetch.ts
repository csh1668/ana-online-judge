"use server";

import { requireAdmin } from "@/lib/auth-utils";
import { getBreadcrumb, listProblemSourceEntries } from "@/lib/services/sources";

export async function getProblemSourcesAction(problemId: number) {
	await requireAdmin();
	return listProblemSourceEntries(problemId);
}

export async function getSourceBreadcrumbAction(sourceId: number) {
	await requireAdmin();
	const chain = await getBreadcrumb(sourceId);
	return chain.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
}
