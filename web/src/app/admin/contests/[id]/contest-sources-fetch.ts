"use server";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contestProblems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

export async function listContestProblemsAction(contestId: number) {
	await requireAdmin();
	return db
		.select({
			problemId: contestProblems.problemId,
			label: contestProblems.label,
		})
		.from(contestProblems)
		.where(eq(contestProblems.contestId, contestId))
		.orderBy(asc(contestProblems.order));
}
