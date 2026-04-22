import { asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { type AlgorithmTag, algorithmTags, problemConfirmedTags } from "@/db/schema";
import { getAncestorChain, validateDepthForParent } from "@/lib/tags/tree-queries";

export interface TagPathSegment {
	id: number;
	name: string;
	slug: string;
}

export interface TagWithPath extends AlgorithmTag {
	path: TagPathSegment[]; // 루트 → 자기 자신
}

export interface TagListItem extends TagWithPath {
	problemCount: number;
}

const orderByName = [asc(algorithmTags.name)];

// ---------------- 조회 ----------------

export async function listRootTags(): Promise<AlgorithmTag[]> {
	return db
		.select()
		.from(algorithmTags)
		.where(isNull(algorithmTags.parentId))
		.orderBy(...orderByName);
}

export async function listChildren(parentId: number): Promise<AlgorithmTag[]> {
	return db
		.select()
		.from(algorithmTags)
		.where(eq(algorithmTags.parentId, parentId))
		.orderBy(...orderByName);
}

export async function getTagBare(id: number): Promise<AlgorithmTag | null> {
	const rows = await db.select().from(algorithmTags).where(eq(algorithmTags.id, id)).limit(1);
	return rows[0] ?? null;
}

async function attachPath(tag: AlgorithmTag): Promise<TagWithPath> {
	const chain = await getAncestorChain(tag.id);
	return {
		...tag,
		path: chain.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
	};
}

export async function getTag(id: number): Promise<TagWithPath | null> {
	const tag = await getTagBare(id);
	return tag ? attachPath(tag) : null;
}

export async function getTagBySlug(slug: string): Promise<TagWithPath | null> {
	const rows = await db.select().from(algorithmTags).where(eq(algorithmTags.slug, slug)).limit(1);
	const tag = rows[0];
	return tag ? attachPath(tag) : null;
}

export async function searchTags(query: string, limit = 30): Promise<TagWithPath[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const tags = await db
		.select()
		.from(algorithmTags)
		.where(ilike(algorithmTags.name, `%${trimmed}%`))
		.orderBy(...orderByName)
		.limit(limit);
	return Promise.all(tags.map(attachPath));
}

/**
 * 알고리즘 분류 페이지용. 평면 목록 + 각 태그의 확정 문제 수.
 * 검색은 name 부분일치, 정렬 가능.
 */
export async function listAllTagsWithProblemCount(options: {
	search?: string;
	sortBy?: "name" | "problemCount";
	order?: "asc" | "desc";
	page?: number;
	limit?: number;
}): Promise<{ tags: TagListItem[]; total: number }> {
	const page = options.page ?? 1;
	const limit = options.limit ?? 100;
	const offset = (page - 1) * limit;
	const sortBy = options.sortBy ?? "problemCount";
	const order = options.order ?? "desc";
	const search = options.search?.trim() ?? "";

	const whereClause = search ? ilike(algorithmTags.name, `%${search}%`) : undefined;

	const countSq = db
		.select({
			tagId: problemConfirmedTags.tagId,
			problemCount: sql<number>`count(*)`.as("problem_count"),
		})
		.from(problemConfirmedTags)
		.groupBy(problemConfirmedTags.tagId)
		.as("counts");

	const orderClauses: ReturnType<typeof asc>[] = [];
	if (sortBy === "name") {
		orderClauses.push(order === "asc" ? asc(algorithmTags.name) : desc(algorithmTags.name));
	} else {
		orderClauses.push(
			order === "asc"
				? asc(sql`COALESCE(${countSq.problemCount}, 0)`)
				: desc(sql`COALESCE(${countSq.problemCount}, 0)`)
		);
	}
	if (sortBy !== "name") orderClauses.push(asc(algorithmTags.name));

	const rows = await db
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
			problemCount: sql<number>`COALESCE(${countSq.problemCount}, 0)`,
		})
		.from(algorithmTags)
		.leftJoin(countSq, eq(algorithmTags.id, countSq.tagId))
		.where(whereClause)
		.orderBy(...orderClauses)
		.limit(limit)
		.offset(offset);

	const totalRow = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(algorithmTags)
		.where(whereClause);

	const tags: TagListItem[] = await Promise.all(
		rows.map(async (r) => ({
			...r,
			path: (await getAncestorChain(r.id)).map((c) => ({
				id: c.id,
				name: c.name,
				slug: c.slug,
			})),
		}))
	);

	return { tags, total: totalRow[0]?.count ?? 0 };
}

// ---------------- CRUD ----------------

export async function createTag(input: {
	parentId: number | null;
	slug: string;
	name: string;
	description: string | null;
	userId: number | null;
}): Promise<AlgorithmTag> {
	await validateDepthForParent(input.parentId);
	const [created] = await db
		.insert(algorithmTags)
		.values({
			parentId: input.parentId,
			slug: input.slug,
			name: input.name,
			description: input.description,
			createdBy: input.userId,
			updatedBy: input.userId,
		})
		.returning();
	return created;
}

export async function updateTag(
	id: number,
	input: {
		parentId?: number | null;
		slug?: string;
		name?: string;
		description?: string | null;
		userId: number | null;
	}
): Promise<AlgorithmTag> {
	if (input.parentId !== undefined) {
		if (input.parentId !== null) {
			const { isDescendantOf } = await import("@/lib/tags/tree-queries");
			if (await isDescendantOf(input.parentId, id)) {
				throw new Error("자기 자신 또는 자손을 부모로 지정할 수 없습니다.");
			}
		}
		await validateDepthForParent(input.parentId);
	}

	const setObj: Record<string, unknown> = { updatedBy: input.userId, updatedAt: new Date() };
	if (input.parentId !== undefined) setObj.parentId = input.parentId;
	if (input.slug !== undefined) setObj.slug = input.slug;
	if (input.name !== undefined) setObj.name = input.name;
	if (input.description !== undefined) setObj.description = input.description;

	const [updated] = await db
		.update(algorithmTags)
		.set(setObj)
		.where(eq(algorithmTags.id, id))
		.returning();
	if (!updated) throw new Error("태그를 찾을 수 없습니다.");
	return updated;
}

export async function deleteTag(id: number): Promise<void> {
	await db.delete(algorithmTags).where(eq(algorithmTags.id, id));
}
