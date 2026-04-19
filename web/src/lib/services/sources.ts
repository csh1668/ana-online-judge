import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	contests,
	problemSources,
	problems,
	type Source,
	sourceAuditLog,
	sources,
} from "@/db/schema";
import { normalizeSourceName } from "@/lib/sources/normalize";
import { getAncestorChain, getDescendantIds, MAX_SOURCE_DEPTH } from "@/lib/sources/tree-queries";

const orderClause = [desc(sources.year), asc(sources.name)];

// ---------------- Read ----------------

export async function listRootSources(): Promise<Source[]> {
	return db
		.select()
		.from(sources)
		.where(isNull(sources.parentId))
		.orderBy(...orderClause);
}

export async function getSource(id: number): Promise<Source | null> {
	const rows = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function listChildren(parentId: number): Promise<Source[]> {
	return db
		.select()
		.from(sources)
		.where(eq(sources.parentId, parentId))
		.orderBy(...orderClause);
}

export async function getBreadcrumb(id: number) {
	return getAncestorChain(id);
}

export async function searchSources(query: string, limit = 30): Promise<Source[]> {
	const normalized = normalizeSourceName(query);
	if (!normalized) return [];
	return db
		.select()
		.from(sources)
		.where(ilike(sources.nameNormalized, `%${normalized}%`))
		.orderBy(...orderClause)
		.limit(limit);
}

export async function countProblemsInSubtree(sourceId: number): Promise<number> {
	const ids = await getDescendantIds(sourceId);
	if (ids.length === 0) return 0;
	const rows = await db
		.select({ n: sql<number>`COUNT(DISTINCT ${problemSources.problemId})::int` })
		.from(problemSources)
		.where(inArray(problemSources.sourceId, ids));
	return rows[0]?.n ?? 0;
}

export interface ProblemListItem {
	id: number;
	title: string;
	isPublic: boolean;
	judgeAvailable: boolean;
	problemType: string;
	problemNumber: string | null;
}

export async function listProblemsBySource(
	sourceId: number,
	opts: { includeDescendants: boolean; page?: number; limit?: number } = {
		includeDescendants: true,
	}
): Promise<{ problems: ProblemListItem[]; total: number; page: number; limit: number }> {
	const page = opts.page ?? 1;
	const limit = opts.limit ?? 20;
	const offset = (page - 1) * limit;
	const ids = opts.includeDescendants ? await getDescendantIds(sourceId) : [sourceId];

	if (ids.length === 0) {
		return { problems: [], total: 0, page, limit };
	}

	// descendants 모드일 때도 문제당 대표 번호 하나만 노출 — MIN() 으로 안정적 선택.
	const [rows, totalRow] = await Promise.all([
		db
			.select({
				id: problems.id,
				title: problems.displayTitle,
				isPublic: problems.isPublic,
				judgeAvailable: problems.judgeAvailable,
				problemType: problems.problemType,
				problemNumber: sql<string | null>`MIN(${problemSources.problemNumber})`,
			})
			.from(problemSources)
			.innerJoin(problems, eq(problems.id, problemSources.problemId))
			.where(inArray(problemSources.sourceId, ids))
			.groupBy(
				problems.id,
				problems.displayTitle,
				problems.isPublic,
				problems.judgeAvailable,
				problems.problemType
			)
			.orderBy(sql`MIN(${problemSources.problemNumber}) ASC NULLS LAST`, asc(problems.id))
			.limit(limit)
			.offset(offset),
		db
			.select({ n: sql<number>`COUNT(DISTINCT ${problemSources.problemId})::int` })
			.from(problemSources)
			.where(inArray(problemSources.sourceId, ids)),
	]);

	return { problems: rows, total: totalRow[0]?.n ?? 0, page, limit };
}

export async function listDirectContests(sourceId: number) {
	return db
		.select({
			id: contests.id,
			title: contests.title,
			startTime: contests.startTime,
			endTime: contests.endTime,
			sourceId: contests.sourceId,
		})
		.from(contests)
		.where(eq(contests.sourceId, sourceId))
		.orderBy(desc(contests.startTime));
}

export async function getProblemNumbersForSource(
	sourceId: number,
	problemIds: number[]
): Promise<Map<number, string | null>> {
	if (problemIds.length === 0) return new Map();
	const rows = await db
		.select({
			problemId: problemSources.problemId,
			problemNumber: problemSources.problemNumber,
		})
		.from(problemSources)
		.where(
			and(eq(problemSources.sourceId, sourceId), inArray(problemSources.problemId, problemIds))
		);
	return new Map(rows.map((r) => [r.problemId, r.problemNumber]));
}

export async function listProblemSources(problemId: number) {
	return db
		.select({
			sourceId: sources.id,
			name: sources.name,
			slug: sources.slug,
			parentId: sources.parentId,
			problemNumber: problemSources.problemNumber,
		})
		.from(problemSources)
		.innerJoin(sources, eq(sources.id, problemSources.sourceId))
		.where(eq(problemSources.problemId, problemId));
}

export interface ProblemSourceEntryInput {
	sourceId: number;
	problemNumber: string | null;
}

export interface ProblemSourceEntryDetail extends ProblemSourceEntryInput {
	chain: { id: number; name: string; slug: string }[];
}

export async function listProblemSourceEntries(
	problemId: number
): Promise<ProblemSourceEntryDetail[]> {
	const rows = await listProblemSources(problemId);
	return Promise.all(
		rows.map(async (r) => {
			const chain = await getAncestorChain(r.sourceId);
			return {
				sourceId: r.sourceId,
				problemNumber: r.problemNumber,
				chain: chain.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
			};
		})
	);
}

export async function findActiveContestForProblem(problemId: number, now = new Date()) {
	const rows = await db
		.select({
			id: contests.id,
			title: contests.title,
			startTime: contests.startTime,
			endTime: contests.endTime,
		})
		.from(problemSources)
		.innerJoin(contests, eq(contests.sourceId, problemSources.sourceId))
		.where(
			and(
				eq(problemSources.problemId, problemId),
				sql`${contests.startTime} <= ${now}`,
				sql`${contests.endTime} >= ${now}`
			)
		)
		.limit(1);
	return rows[0] ?? null;
}

// ---------------- Write ----------------

async function assertSiblingSlugUnique(
	tx: typeof db,
	parentId: number | null,
	slug: string,
	excludeId?: number
) {
	const conflict = await tx
		.select({ id: sources.id })
		.from(sources)
		.where(
			and(
				parentId === null ? isNull(sources.parentId) : eq(sources.parentId, parentId),
				eq(sources.slug, slug)
			)
		)
		.limit(1);
	const hit = conflict[0];
	if (hit && hit.id !== excludeId) {
		throw new Error("동일 slug 가 형제 노드에 이미 존재합니다");
	}
}

async function assertDepthOk(parentId: number | null) {
	if (parentId === null) return;
	const chain = await getAncestorChain(parentId);
	if (chain.length >= MAX_SOURCE_DEPTH) {
		throw new Error(`트리 최대 깊이(${MAX_SOURCE_DEPTH}) 초과`);
	}
}

async function writeAuditLog(
	tx: typeof db,
	params: {
		sourceId: number | null;
		action:
			| "create"
			| "update"
			| "move"
			| "delete"
			| "link"
			| "unlink"
			| "attach-contest"
			| "detach-contest";
		actorId: number | null;
		payload: Record<string, unknown>;
	}
) {
	await tx.insert(sourceAuditLog).values({
		sourceId: params.sourceId,
		action: params.action,
		actorId: params.actorId,
		payloadJson: params.payload,
	});
}

export async function createSource(
	input: { parentId: number | null; slug: string; name: string; year: number | null },
	actorId: number | null
): Promise<Source> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('sources'))`);
		await assertSiblingSlugUnique(tx as unknown as typeof db, input.parentId, input.slug);
		await assertDepthOk(input.parentId);

		const [row] = await tx
			.insert(sources)
			.values({
				parentId: input.parentId,
				slug: input.slug,
				name: input.name,
				nameNormalized: normalizeSourceName(input.name),
				year: input.year,
				createdBy: actorId,
				updatedBy: actorId,
			})
			.returning();

		await writeAuditLog(tx as unknown as typeof db, {
			sourceId: row.id,
			action: "create",
			actorId,
			payload: { input },
		});
		return row;
	});
}

export async function updateSource(
	id: number,
	patch: {
		parentId?: number | null;
		slug?: string;
		name?: string;
		year?: number | null;
	},
	actorId: number | null
): Promise<Source> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('sources'))`);

		const current = await tx.select().from(sources).where(eq(sources.id, id)).limit(1);
		if (!current[0]) throw new Error("존재하지 않는 source");
		const before = current[0];

		const nextParent = patch.parentId === undefined ? before.parentId : patch.parentId;
		const nextSlug = patch.slug ?? before.slug;

		if (patch.parentId !== undefined && patch.parentId !== null) {
			// 자기자신/후손으로 이동 금지
			const descendants = await getDescendantIds(id);
			if (descendants.includes(patch.parentId)) {
				throw new Error("자기 자신 또는 자기 후손으로 이동 불가");
			}
			await assertDepthOk(patch.parentId);
		}

		if (nextSlug !== before.slug || nextParent !== before.parentId) {
			await assertSiblingSlugUnique(tx as unknown as typeof db, nextParent, nextSlug, id);
		}

		const [row] = await tx
			.update(sources)
			.set({
				parentId: nextParent,
				slug: nextSlug,
				name: patch.name ?? before.name,
				nameNormalized:
					patch.name !== undefined ? normalizeSourceName(patch.name) : before.nameNormalized,
				year: patch.year === undefined ? before.year : patch.year,
				updatedBy: actorId,
				updatedAt: new Date(),
			})
			.where(eq(sources.id, id))
			.returning();

		const moved = patch.parentId !== undefined && patch.parentId !== before.parentId;
		await writeAuditLog(tx as unknown as typeof db, {
			sourceId: id,
			action: moved ? "move" : "update",
			actorId,
			payload: { before, patch },
		});
		return row;
	});
}

export async function deleteSource(id: number, actorId: number | null) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('sources'))`);

		const before = await tx.select().from(sources).where(eq(sources.id, id)).limit(1);
		if (!before[0]) throw new Error("존재하지 않는 source");
		const descendantIds = await getDescendantIds(id);

		const problemsAffected = await tx
			.select({ n: sql<number>`COUNT(DISTINCT ${problemSources.problemId})::int` })
			.from(problemSources)
			.where(inArray(problemSources.sourceId, descendantIds));
		const contestsAffected = await tx
			.select({ id: contests.id })
			.from(contests)
			.where(inArray(contests.sourceId, descendantIds));

		await tx.delete(sources).where(eq(sources.id, id)); // cascade deletes subtree

		await writeAuditLog(tx as unknown as typeof db, {
			sourceId: null,
			action: "delete",
			actorId,
			payload: {
				id,
				before: before[0],
				descendantCount: descendantIds.length - 1,
				problemsAffected: problemsAffected[0]?.n ?? 0,
				detachedContestIds: contestsAffected.map((c) => c.id),
			},
		});

		return {
			deleted: true,
			descendantCount: descendantIds.length - 1,
			problemsAffected: problemsAffected[0]?.n ?? 0,
			detachedContestIds: contestsAffected.map((c) => c.id),
		};
	});
}

export async function previewDeleteImpact(id: number) {
	const descendantIds = await getDescendantIds(id);
	if (descendantIds.length === 0) {
		// 존재하지 않는 source — 빈 결과 반환 (이후 inArray([]) 호출을 피한다)
		return { descendantCount: 0, problemsAffected: 0, detachableContests: [] };
	}
	const [problemsAffected, contestsAffected] = await Promise.all([
		db
			.select({ n: sql<number>`COUNT(DISTINCT ${problemSources.problemId})::int` })
			.from(problemSources)
			.where(inArray(problemSources.sourceId, descendantIds)),
		db
			.select({ id: contests.id, title: contests.title })
			.from(contests)
			.where(inArray(contests.sourceId, descendantIds)),
	]);
	return {
		descendantCount: descendantIds.length - 1,
		problemsAffected: problemsAffected[0]?.n ?? 0,
		detachableContests: contestsAffected,
	};
}

export async function setProblemSources(
	problemId: number,
	entries: ProblemSourceEntryInput[],
	actorId: number | null
) {
	// 동일 sourceId 중복 시 뒤 값이 이기도록 병합 (UI 단의 실수 방지)
	const byId = new Map<number, string | null>();
	for (const e of entries) byId.set(e.sourceId, e.problemNumber);
	const merged: ProblemSourceEntryInput[] = [...byId.entries()].map(
		([sourceId, problemNumber]) => ({ sourceId, problemNumber })
	);
	return db.transaction(async (tx) => {
		const prev = await tx
			.select({
				sourceId: problemSources.sourceId,
				problemNumber: problemSources.problemNumber,
			})
			.from(problemSources)
			.where(eq(problemSources.problemId, problemId));
		const prevMap = new Map(prev.map((r) => [r.sourceId, r.problemNumber]));
		const nextMap = new Map(merged.map((e) => [e.sourceId, e.problemNumber]));
		const added = [...nextMap.keys()].filter((id) => !prevMap.has(id));
		const removed = [...prevMap.keys()].filter((id) => !nextMap.has(id));
		const changed = [...nextMap.entries()]
			.filter(([id, num]) => prevMap.has(id) && prevMap.get(id) !== num)
			.map(([id]) => id);

		await tx.delete(problemSources).where(eq(problemSources.problemId, problemId));
		if (merged.length > 0) {
			await tx.insert(problemSources).values(
				merged.map((e) => ({
					problemId,
					sourceId: e.sourceId,
					problemNumber: e.problemNumber,
					createdBy: actorId,
				}))
			);
		}

		if (added.length > 0 || removed.length > 0 || changed.length > 0) {
			await writeAuditLog(tx as unknown as typeof db, {
				sourceId: null,
				action: "link",
				actorId,
				payload: { problemId, added, removed, changed },
			});
		}
	});
}

export interface AddProblemToSourceInput {
	problemId: number;
	problemNumber?: string | null;
}

export async function addProblemsToSource(
	sourceId: number,
	items: AddProblemToSourceInput[],
	actorId: number | null
) {
	if (items.length === 0) return { inserted: 0 };
	return db.transaction(async (tx) => {
		// 기존 번호가 비어있는 경우에만 새 번호로 덮어쓰기. 이미 설정된 커스텀 라벨은 보존한다.
		const inserted = await tx
			.insert(problemSources)
			.values(
				items.map((it) => ({
					problemId: it.problemId,
					sourceId,
					problemNumber: it.problemNumber ?? null,
					createdBy: actorId,
				}))
			)
			.onConflictDoUpdate({
				target: [problemSources.problemId, problemSources.sourceId],
				set: {
					problemNumber: sql`COALESCE(NULLIF(${problemSources.problemNumber}, ''), excluded.problem_number)`,
				},
			})
			.returning({
				problemId: problemSources.problemId,
				problemNumber: problemSources.problemNumber,
			});

		if (inserted.length > 0) {
			await writeAuditLog(tx as unknown as typeof db, {
				sourceId,
				action: "link",
				actorId,
				payload: { upsertedProblems: inserted },
			});
		}
		return { inserted: inserted.length };
	});
}

export async function setContestSource(
	contestId: number,
	sourceId: number | null,
	actorId: number | null
): Promise<{ previousSourceId: number | null }> {
	return db.transaction(async (tx) => {
		const [before] = await tx
			.select({ sourceId: contests.sourceId })
			.from(contests)
			.where(eq(contests.id, contestId))
			.limit(1);
		const previousSourceId = before?.sourceId ?? null;
		if (previousSourceId === sourceId) {
			return { previousSourceId };
		}
		await tx.update(contests).set({ sourceId }).where(eq(contests.id, contestId));
		await writeAuditLog(tx as unknown as typeof db, {
			sourceId,
			action: sourceId === null ? "detach-contest" : "attach-contest",
			actorId,
			payload: { contestId, previousSourceId, newSourceId: sourceId },
		});
		return { previousSourceId };
	});
}

export async function createSourceAndAttachContest(
	contestId: number,
	input: { parentId: number | null; slug: string; name: string; year: number | null },
	actorId: number | null
): Promise<Source> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('sources'))`);
		await assertSiblingSlugUnique(tx as unknown as typeof db, input.parentId, input.slug);
		await assertDepthOk(input.parentId);

		const [row] = await tx
			.insert(sources)
			.values({
				parentId: input.parentId,
				slug: input.slug,
				name: input.name,
				nameNormalized: normalizeSourceName(input.name),
				year: input.year,
				createdBy: actorId,
				updatedBy: actorId,
			})
			.returning();

		await tx.update(contests).set({ sourceId: row.id }).where(eq(contests.id, contestId));

		await writeAuditLog(tx as unknown as typeof db, {
			sourceId: row.id,
			action: "create",
			actorId,
			payload: { input, attachedContestId: contestId },
		});
		await writeAuditLog(tx as unknown as typeof db, {
			sourceId: row.id,
			action: "attach-contest",
			actorId,
			payload: { contestId, previousSourceId: null, newSourceId: row.id },
		});
		return row;
	});
}
