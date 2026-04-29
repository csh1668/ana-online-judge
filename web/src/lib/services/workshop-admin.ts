import { and, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, workshopProblems, workshopSnapshots } from "@/db/schema";
import type { WorkshopSnapshotStateJson } from "@/lib/workshop/snapshot-contract";

export interface AdminWorkshopListItem {
	id: number;
	title: string;
	createdAt: Date;
	updatedAt: Date;
	ownerUserId: number;
	ownerUsername: string;
	ownerName: string;
	latestSnapshotLabel: string | null;
	latestSnapshotCreatedAt: Date | null;
	latestSnapshotTestcaseCount: number;
	publishedProblemId: number | null;
}

/**
 * List every workshop problem across the site. Admin-only.
 * `q` optionally filters by title or owner username (substring match, case-insensitive).
 */
export async function listAllWorkshopProblemsForAdmin(
	q?: string,
	options?: { published?: boolean }
): Promise<AdminWorkshopListItem[]> {
	const conditions: SQL[] = [];
	if (q) {
		const term = `%${q.toLowerCase()}%`;
		const orClause = or(
			sql`LOWER(${workshopProblems.title}) LIKE ${term}`,
			sql`LOWER(${users.username}) LIKE ${term}`
		);
		if (orClause) conditions.push(orClause);
	}
	if (options?.published === true) {
		conditions.push(sql`${workshopProblems.publishedProblemId} IS NOT NULL`);
	} else if (options?.published === false) {
		conditions.push(sql`${workshopProblems.publishedProblemId} IS NULL`);
	}
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const rows = await db
		.select({
			id: workshopProblems.id,
			title: workshopProblems.title,
			createdAt: workshopProblems.createdAt,
			updatedAt: workshopProblems.updatedAt,
			ownerUserId: workshopProblems.createdBy,
			ownerUsername: users.username,
			ownerName: users.name,
			publishedProblemId: workshopProblems.publishedProblemId,
		})
		.from(workshopProblems)
		.innerJoin(users, eq(users.id, workshopProblems.createdBy))
		.where(whereClause)
		.orderBy(desc(workshopProblems.updatedAt));

	// Batch-fetch latest snapshot per problem using a single query (avoids N+1).
	const problemIds = rows.map((r) => r.id);
	const snapshotMap = new Map<
		number,
		{ label: string | null; createdAt: Date; stateJson: unknown }
	>();
	if (problemIds.length > 0) {
		// Fetch all snapshots for these problem IDs ordered by createdAt desc,
		// then keep the first (newest) per problem in JS.
		const allSnaps = await db
			.select({
				workshopProblemId: workshopSnapshots.workshopProblemId,
				label: workshopSnapshots.label,
				createdAt: workshopSnapshots.createdAt,
				stateJson: workshopSnapshots.stateJson,
			})
			.from(workshopSnapshots)
			.where(inArray(workshopSnapshots.workshopProblemId, problemIds))
			.orderBy(desc(workshopSnapshots.createdAt));
		for (const snap of allSnaps) {
			if (!snapshotMap.has(snap.workshopProblemId)) {
				snapshotMap.set(snap.workshopProblemId, {
					label: snap.label,
					createdAt: snap.createdAt,
					stateJson: snap.stateJson,
				});
			}
		}
	}

	return rows.map((row) => {
		const snap = snapshotMap.get(row.id);
		let tcCount = 0;
		let label: string | null = null;
		let snapCreatedAt: Date | null = null;
		if (snap) {
			label = snap.label;
			snapCreatedAt = snap.createdAt;
			const state = snap.stateJson as WorkshopSnapshotStateJson;
			tcCount = state.testcases?.length ?? 0;
		}
		return {
			...row,
			latestSnapshotLabel: label,
			latestSnapshotCreatedAt: snapCreatedAt,
			latestSnapshotTestcaseCount: tcCount,
		};
	});
}

/**
 * Load the detail view for the `/admin/workshop/[id]` page.
 */
export async function getAdminWorkshopProblemDetail(workshopProblemId: number) {
	const [wp] = await db
		.select({
			id: workshopProblems.id,
			title: workshopProblems.title,
			problemType: workshopProblems.problemType,
			timeLimit: workshopProblems.timeLimit,
			memoryLimit: workshopProblems.memoryLimit,
			publishedProblemId: workshopProblems.publishedProblemId,
			createdBy: workshopProblems.createdBy,
			createdAt: workshopProblems.createdAt,
			updatedAt: workshopProblems.updatedAt,
			ownerUsername: users.username,
			ownerName: users.name,
		})
		.from(workshopProblems)
		.innerJoin(users, eq(users.id, workshopProblems.createdBy))
		.where(eq(workshopProblems.id, workshopProblemId))
		.limit(1);

	if (!wp) return null;

	const [snap] = await db
		.select()
		.from(workshopSnapshots)
		.where(eq(workshopSnapshots.workshopProblemId, workshopProblemId))
		.orderBy(desc(workshopSnapshots.createdAt))
		.limit(1);

	return {
		problem: wp,
		latestSnapshot: snap ?? null,
	};
}
