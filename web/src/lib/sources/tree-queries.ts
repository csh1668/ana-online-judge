import { sql } from "drizzle-orm";
import { db } from "@/db";

export const MAX_SOURCE_DEPTH = 5;

export interface AncestorRow {
	id: number;
	parentId: number | null;
	slug: string;
	name: string;
	depth: number;
}

// 루트에서 target 까지의 조상 배열. 루트가 배열의 맨 앞.
export async function getAncestorChain(sourceId: number): Promise<AncestorRow[]> {
	const result = await db.execute<{
		id: number;
		parentId: number | null;
		slug: string;
		name: string;
		depth: number;
	}>(sql`
		WITH RECURSIVE ancestors AS (
			SELECT id, parent_id, slug, name, 0 AS depth
			FROM sources
			WHERE id = ${sourceId}
			UNION ALL
			SELECT s.id, s.parent_id, s.slug, s.name, a.depth + 1
			FROM sources s
			JOIN ancestors a ON s.id = a.parent_id
			WHERE a.depth < ${MAX_SOURCE_DEPTH}
		)
		SELECT id, parent_id AS "parentId", slug, name, depth
		FROM ancestors
		ORDER BY depth DESC
	`);
	return result as unknown as AncestorRow[];
}

// 자기 자신을 포함한 하위 트리의 모든 id.
export async function getDescendantIds(rootId: number): Promise<number[]> {
	const result = await db.execute<{ id: number }>(sql`
		WITH RECURSIVE descendants AS (
			SELECT id, 0 AS depth FROM sources WHERE id = ${rootId}
			UNION ALL
			SELECT s.id, d.depth + 1
			FROM sources s
			JOIN descendants d ON s.parent_id = d.id
			WHERE d.depth < ${MAX_SOURCE_DEPTH}
		)
		SELECT id FROM descendants
	`);
	return (result as unknown as { id: number }[]).map((r) => r.id);
}

// 루트까지 포함한 경로 길이. 루트 = 1, 리프가 5단계라면 5.
export async function getDepth(sourceId: number): Promise<number> {
	const chain = await getAncestorChain(sourceId);
	return chain.length;
}

export async function isDescendantOf(candidateId: number, ancestorId: number): Promise<boolean> {
	if (candidateId === ancestorId) return true;
	const descendants = await getDescendantIds(ancestorId);
	return descendants.includes(candidateId);
}
