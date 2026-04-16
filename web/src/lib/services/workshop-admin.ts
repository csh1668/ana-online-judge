import { desc, eq, or, sql } from "drizzle-orm";
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
	q?: string
): Promise<AdminWorkshopListItem[]> {
	const whereClause = q
		? or(
				sql`LOWER(${workshopProblems.title}) LIKE ${`%${q.toLowerCase()}%`}`,
				sql`LOWER(${users.username}) LIKE ${`%${q.toLowerCase()}%`}`
			)
		: undefined;

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

	const enriched: AdminWorkshopListItem[] = [];
	for (const row of rows) {
		const [snap] = await db
			.select()
			.from(workshopSnapshots)
			.where(eq(workshopSnapshots.workshopProblemId, row.id))
			.orderBy(desc(workshopSnapshots.createdAt))
			.limit(1);
		let tcCount = 0;
		let label: string | null = null;
		let snapCreatedAt: Date | null = null;
		if (snap) {
			label = snap.label;
			snapCreatedAt = snap.createdAt;
			const state = snap.stateJson as WorkshopSnapshotStateJson;
			tcCount = state.testcases?.length ?? 0;
		}
		enriched.push({
			...row,
			latestSnapshotLabel: label,
			latestSnapshotCreatedAt: snapCreatedAt,
			latestSnapshotTestcaseCount: tcCount,
		});
	}
	return enriched;
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
