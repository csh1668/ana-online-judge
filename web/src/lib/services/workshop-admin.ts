import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, workshopProblems, workshopSnapshots } from "@/db/schema";
import { resolveDisplayHeader, resolveDisplayHeaders } from "@/lib/services/workshop-display";
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
	// Title is no longer a column on workshopProblems (it lives in the per-user
	// draft / latest snapshot), so the title-substring filter is applied in JS
	// after resolving display headers. Only the published filter is pushed to SQL.
	const conditions: SQL[] = [];
	if (options?.published === true) {
		conditions.push(sql`${workshopProblems.publishedProblemId} IS NOT NULL`);
	} else if (options?.published === false) {
		conditions.push(sql`${workshopProblems.publishedProblemId} IS NULL`);
	}
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const baseRows = await db
		.select({
			id: workshopProblems.id,
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

	// Resolve display headers (latest snapshot → creator draft → fallback) so the
	// list shows the canonical title and so we can filter by it in JS.
	const headerMap = await resolveDisplayHeaders(baseRows.map((r) => r.id));

	// Apply the `q` filter (title OR owner username, case-insensitive substring).
	const term = q?.toLowerCase().trim();
	const rows = (
		term
			? baseRows.filter((r) => {
					const title = headerMap.get(r.id)?.title ?? "";
					return title.toLowerCase().includes(term) || r.ownerUsername.toLowerCase().includes(term);
				})
			: baseRows
	).map((r) => ({ ...r, title: headerMap.get(r.id)?.title ?? "" }));

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
			publishedProblemId: workshopProblems.publishedProblemId,
			publishedSnapshotId: workshopProblems.publishedSnapshotId,
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

	// Header (title/type/limits) resolves from the latest snapshot → creator draft
	// → fallback, since these fields no longer live on workshopProblems.
	const header = await resolveDisplayHeader(workshopProblemId);

	const [snap] = await db
		.select()
		.from(workshopSnapshots)
		.where(eq(workshopSnapshots.workshopProblemId, workshopProblemId))
		.orderBy(desc(workshopSnapshots.createdAt))
		.limit(1);

	return {
		problem: {
			...wp,
			title: header.title,
			problemType: header.problemType,
			timeLimit: header.timeLimit,
			memoryLimit: header.memoryLimit,
		},
		latestSnapshot: snap ?? null,
	};
}
