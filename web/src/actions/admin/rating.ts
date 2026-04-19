"use server";

import { requireAdmin } from "@/lib/auth-utils";
import { enqueue } from "@/lib/queue/rating-queue";
import { listAllUserIds } from "@/lib/services/user-rating";

export async function recomputeAllUserRatingsAction(): Promise<{ count: number }> {
	await requireAdmin();
	const ids = await listAllUserIds();
	for (const userId of ids) {
		enqueue({ kind: "recomputeUserRating", userId });
	}
	return { count: ids.length };
}
