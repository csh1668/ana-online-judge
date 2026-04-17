"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contestProblems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

export async function listContestProblemIdsAction(contestId: number) {
	await requireAdmin();
	const rows = await db
		.select({ problemId: contestProblems.problemId })
		.from(contestProblems)
		.where(eq(contestProblems.contestId, contestId));
	return rows.map((r) => r.problemId);
}
