import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { problemConfirmedTags, problems, problemVoteTags, submissions } from "@/db/schema";
import type { TagWithPath } from "@/lib/services/algorithm-tags";
import { getAncestorChain } from "@/lib/tags/tree-queries";

export const MAX_TAGS_PER_VOTE = 10;
export const TAG_CONFIRM_DIVISOR = 3;

export async function replaceUserVoteTags(input: {
	userId: number;
	problemId: number;
	tagIds: number[];
}): Promise<void> {
	const { userId, problemId } = input;
	if (input.tagIds.length > MAX_TAGS_PER_VOTE) {
		throw new Error(`태그는 최대 ${MAX_TAGS_PER_VOTE}개까지 선택할 수 있습니다.`);
	}

	const allTagIds = new Set<number>();
	for (const tagId of input.tagIds) {
		const chain = await getAncestorChain(tagId);
		for (const c of chain) allTagIds.add(c.id);
	}

	await db.transaction(async (tx) => {
		await tx
			.delete(problemVoteTags)
			.where(and(eq(problemVoteTags.userId, userId), eq(problemVoteTags.problemId, problemId)));
		if (allTagIds.size > 0) {
			await tx.insert(problemVoteTags).values(
				Array.from(allTagIds).map((tagId) => ({
					userId,
					problemId,
					tagId,
				}))
			);
		}
	});
}

export async function getMyVoteTags(userId: number, problemId: number): Promise<number[]> {
	const rows = await db
		.select({ tagId: problemVoteTags.tagId })
		.from(problemVoteTags)
		.where(and(eq(problemVoteTags.userId, userId), eq(problemVoteTags.problemId, problemId)));
	return rows.map((r) => r.tagId);
}

/**
 * 1/3 다수결로 확정 태그 재계산.
 *
 * NOTE (single-instance assumption): 큐 dedup으로 동일 problemId 동시 재계산은 차단되지만,
 * 멀티 인스턴스 시 idempotent. 자세한 내용은 lib/queue/rating-queue.ts 헤더 참고.
 */
export async function recomputeProblemTags(problemId: number): Promise<number[]> {
	const voterRows = await db.execute<{ cnt: number }>(sql`
		SELECT COUNT(DISTINCT user_id)::int AS cnt
		FROM problem_vote_tags
		WHERE problem_id = ${problemId}
	`);
	const totalVoters = voterRows[0]?.cnt ?? 0;

	const confirmed: number[] = [];
	if (totalVoters > 0) {
		const threshold = Math.ceil(totalVoters / TAG_CONFIRM_DIVISOR);
		const rows = await db.execute<{ tag_id: number }>(sql`
			SELECT tag_id
			FROM problem_vote_tags
			WHERE problem_id = ${problemId}
			GROUP BY tag_id
			HAVING COUNT(DISTINCT user_id) >= ${threshold}
		`);
		for (const r of rows) confirmed.push(r.tag_id);
	}

	await db.transaction(async (tx) => {
		await tx.delete(problemConfirmedTags).where(eq(problemConfirmedTags.problemId, problemId));
		if (confirmed.length > 0) {
			await tx
				.insert(problemConfirmedTags)
				.values(confirmed.map((tagId) => ({ problemId, tagId })));
		}
	});

	return confirmed;
}

export async function listConfirmedTagsForProblem(problemId: number): Promise<TagWithPath[]> {
	const { algorithmTags } = await import("@/db/schema");
	const tags = await db
		.select({
			id: algorithmTags.id,
			parentId: algorithmTags.parentId,
			slug: algorithmTags.slug,
			name: algorithmTags.name,
			description: algorithmTags.description,
			createdBy: algorithmTags.createdBy,
			updatedBy: algorithmTags.updatedBy,
			createdAt: algorithmTags.createdAt,
			updatedAt: algorithmTags.updatedAt,
		})
		.from(problemConfirmedTags)
		.innerJoin(algorithmTags, eq(algorithmTags.id, problemConfirmedTags.tagId))
		.where(eq(problemConfirmedTags.problemId, problemId));

	const withPath: TagWithPath[] = await Promise.all(
		tags.map(async (t) => {
			const chain = await getAncestorChain(t.id);
			return {
				...t,
				path: chain.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
			};
		})
	);

	return withPath.sort((a, b) => {
		const da = a.path.length;
		const dbLen = b.path.length;
		if (da !== dbLen) return da - dbLen;
		return a.name.localeCompare(b.name);
	});
}

export interface ProblemByTagRow {
	id: number;
	title: string;
	problemType: string;
	judgeAvailable: boolean;
	languageRestricted: boolean;
	isPublic: boolean;
	tier: number;
	submissionCount: number;
	acceptedCount: number;
}

export async function listProblemsByTag(
	tagId: number,
	options: {
		sort?: "id" | "title" | "acceptedCount" | "submissionCount";
		order?: "asc" | "desc";
		page?: number;
		limit?: number;
	}
): Promise<{ problems: ProblemByTagRow[]; total: number }> {
	const page = options.page ?? 1;
	const limit = options.limit ?? 100;
	const offset = (page - 1) * limit;
	const sort = options.sort ?? "acceptedCount";
	const order = options.order ?? "desc";

	const statsSq = db
		.select({
			problemId: submissions.problemId,
			submissionCount: count().as("sc"),
			acceptedCount:
				sql<number>`count(case when ${submissions.verdict} = 'accepted' then 1 end)`.as("ac"),
		})
		.from(submissions)
		.groupBy(submissions.problemId)
		.as("stats");

	const orderColumn = (() => {
		switch (sort) {
			case "title":
				return sql`${problems.title}`;
			case "acceptedCount":
				return sql`COALESCE(${statsSq.acceptedCount}, 0)`;
			case "submissionCount":
				return sql`COALESCE(${statsSq.submissionCount}, 0)`;
			default:
				return sql`${problems.id}`;
		}
	})();
	const orderClause = order === "asc" ? sql`${orderColumn} ASC` : sql`${orderColumn} DESC`;

	const rows = await db
		.select({
			id: problems.id,
			title: problems.title,
			problemType: problems.problemType,
			judgeAvailable: problems.judgeAvailable,
			languageRestricted: sql<boolean>`${problems.allowedLanguages} IS NOT NULL`,
			isPublic: problems.isPublic,
			tier: problems.tier,
			submissionCount: sql<number>`COALESCE(${statsSq.submissionCount}, 0)`,
			acceptedCount: sql<number>`COALESCE(${statsSq.acceptedCount}, 0)`,
		})
		.from(problemConfirmedTags)
		.innerJoin(problems, eq(problems.id, problemConfirmedTags.problemId))
		.leftJoin(statsSq, eq(problems.id, statsSq.problemId))
		.where(and(eq(problemConfirmedTags.tagId, tagId), eq(problems.isPublic, true)))
		.orderBy(orderClause)
		.limit(limit)
		.offset(offset);

	const totalRow = await db
		.select({ cnt: sql<number>`count(*)::int` })
		.from(problemConfirmedTags)
		.innerJoin(problems, eq(problems.id, problemConfirmedTags.problemId))
		.where(and(eq(problemConfirmedTags.tagId, tagId), eq(problems.isPublic, true)));

	return {
		problems: rows.map((r) => ({ ...r, problemType: r.problemType as string })),
		total: totalRow[0]?.cnt ?? 0,
	};
}

export async function listProblemIdsAffectedByTags(tagIds: number[]): Promise<number[]> {
	if (tagIds.length === 0) return [];
	const rows = await db.execute<{ problem_id: number }>(sql`
		SELECT DISTINCT problem_id
		FROM problem_vote_tags
		WHERE tag_id = ANY(${tagIds})
	`);
	return rows.map((r) => r.problem_id);
}
