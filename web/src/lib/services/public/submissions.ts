import "server-only";

import { and, asc, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { problems, submissions, users, type Verdict } from "@/db/schema";
import type { Language } from "@/lib/languages";

export interface PublicSubmissionListItem {
	id: number;
	username: string;
	problemId: number;
	problemTitle: string;
	language: string;
	verdict: string;
	executionTime: number | null;
	memoryUsed: number | null;
	codeLength: number | null;
	score: number | null;
	createdAt: string;
}

export interface PublicSubmissionListResult {
	submissions: PublicSubmissionListItem[];
	total: number;
	page: number;
	limit: number;
}

export async function listPublicSubmissions(input: {
	page?: number;
	limit?: number;
	username?: string;
	problemId?: number;
	verdict?: string;
	language?: string;
	sort?: "id" | "createdAt" | "executionTime" | "memoryUsed";
	order?: "asc" | "desc";
}): Promise<PublicSubmissionListResult> {
	const page = input.page ?? 1;
	const limit = Math.min(input.limit ?? 20, 100);
	const offset = (page - 1) * limit;
	const sort = input.sort ?? "createdAt";
	const order = input.order ?? "desc";

	const conditions: SQL[] = [eq(problems.isPublic, true), isNull(submissions.contestId)];
	if (input.username) {
		conditions.push(eq(users.username, input.username));
	}
	if (input.problemId) conditions.push(eq(submissions.problemId, input.problemId));
	if (input.verdict && input.verdict !== "all") {
		conditions.push(eq(submissions.verdict, input.verdict as Verdict));
	}
	if (input.language && input.language !== "all") {
		conditions.push(eq(submissions.language, input.language as Language));
	}

	const where = and(...conditions);

	let orderBy: SQL;
	switch (sort) {
		case "id":
			orderBy = order === "asc" ? asc(submissions.id) : desc(submissions.id);
			break;
		case "executionTime":
			orderBy = order === "asc" ? asc(submissions.executionTime) : desc(submissions.executionTime);
			break;
		case "memoryUsed":
			orderBy = order === "asc" ? asc(submissions.memoryUsed) : desc(submissions.memoryUsed);
			break;
		default:
			orderBy = order === "asc" ? asc(submissions.createdAt) : desc(submissions.createdAt);
	}

	const [rows, totalRow] = await Promise.all([
		db
			.select({
				id: submissions.id,
				username: users.username,
				problemId: submissions.problemId,
				problemTitle: problems.displayTitle,
				language: submissions.language,
				verdict: submissions.verdict,
				executionTime: submissions.executionTime,
				memoryUsed: submissions.memoryUsed,
				codeLength: submissions.codeLength,
				score: submissions.score,
				createdAt: submissions.createdAt,
			})
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.innerJoin(users, eq(submissions.userId, users.id))
			.where(where)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset),
		db
			.select({ count: count() })
			.from(submissions)
			.innerJoin(problems, eq(submissions.problemId, problems.id))
			.innerJoin(users, eq(submissions.userId, users.id))
			.where(where),
	]);

	return {
		submissions: rows.map((r) => ({
			id: r.id,
			username: r.username,
			problemId: r.problemId,
			problemTitle: r.problemTitle,
			language: r.language,
			verdict: r.verdict,
			executionTime: r.executionTime,
			memoryUsed: r.memoryUsed,
			codeLength: r.codeLength,
			score: r.score ?? null,
			createdAt: r.createdAt.toISOString(),
		})),
		total: totalRow[0].count,
		page,
		limit,
	};
}
