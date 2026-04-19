import { sql } from "drizzle-orm";
import { db } from "@/db";

export const MAX_TAG_DEPTH = 5;

export interface TagAncestorRow {
	id: number;
	parentId: number | null;
	slug: string;
	name: string;
	depth: number;
}

/** 자기 자신을 포함, 루트까지의 ancestor 배열. 배열 맨 앞이 루트. */
export async function getAncestorChain(tagId: number): Promise<TagAncestorRow[]> {
	const result = await db.execute<{
		id: number;
		parentId: number | null;
		slug: string;
		name: string;
		depth: number;
	}>(sql`
		WITH RECURSIVE ancestors AS (
			SELECT id, parent_id, slug, name, 0 AS depth
			FROM algorithm_tags
			WHERE id = ${tagId}
			UNION ALL
			SELECT t.id, t.parent_id, t.slug, t.name, a.depth + 1
			FROM algorithm_tags t
			JOIN ancestors a ON t.id = a.parent_id
			WHERE a.depth < ${MAX_TAG_DEPTH}
		)
		SELECT id, parent_id AS "parentId", slug, name, depth
		FROM ancestors
		ORDER BY depth DESC
	`);
	return result as unknown as TagAncestorRow[];
}

/** 자기 자신 포함, 모든 descendant id. */
export async function getDescendantIds(rootId: number): Promise<number[]> {
	const result = await db.execute<{ id: number }>(sql`
		WITH RECURSIVE descendants AS (
			SELECT id, 0 AS depth FROM algorithm_tags WHERE id = ${rootId}
			UNION ALL
			SELECT t.id, d.depth + 1
			FROM algorithm_tags t
			JOIN descendants d ON t.parent_id = d.id
			WHERE d.depth < ${MAX_TAG_DEPTH}
		)
		SELECT id FROM descendants
	`);
	return (result as unknown as { id: number }[]).map((r) => r.id);
}

/** 루트=1 기준 깊이. */
export async function getDepth(tagId: number): Promise<number> {
	const chain = await getAncestorChain(tagId);
	return chain.length;
}

export async function isDescendantOf(candidateId: number, ancestorId: number): Promise<boolean> {
	if (candidateId === ancestorId) return true;
	const descendants = await getDescendantIds(ancestorId);
	return descendants.includes(candidateId);
}

/** 새 자식을 parentId 아래에 추가/이동할 때 깊이 검증. 초과 시 throw. */
export async function validateDepthForParent(parentId: number | null): Promise<void> {
	if (parentId == null) return;
	const parentDepth = await getDepth(parentId);
	if (parentDepth + 1 > MAX_TAG_DEPTH) {
		throw new Error(`태그 깊이가 ${MAX_TAG_DEPTH}를 초과합니다.`);
	}
}
