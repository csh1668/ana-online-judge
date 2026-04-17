"use server";

import { requireAdmin } from "@/lib/auth-utils";
import { listProblemSources } from "@/lib/services/sources";

export async function getProblemSourcesAction(problemId: number) {
	await requireAdmin();
	return listProblemSources(problemId);
}
