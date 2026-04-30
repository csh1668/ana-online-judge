import { and, count, eq, gte, inArray, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contestParticipants, contests, practices } from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";

export async function getRunningContestPracticeCounts(): Promise<{
	contestCount: number;
	practiceCount: number;
}> {
	const { userId, isAdmin } = await getSessionInfo();
	const now = new Date();

	const contestWhere: SQL[] = [lte(contests.startTime, now), gte(contests.endTime, now)];

	if (!isAdmin) {
		if (userId) {
			const registered = await db
				.select({ contestId: contestParticipants.contestId })
				.from(contestParticipants)
				.where(eq(contestParticipants.userId, userId));
			const registeredIds = registered.map((r) => r.contestId);

			const visClause =
				registeredIds.length > 0
					? or(
							eq(contests.visibility, "public"),
							and(eq(contests.visibility, "private"), inArray(contests.id, registeredIds))
						)
					: eq(contests.visibility, "public");
			if (visClause) contestWhere.push(visClause);
		} else {
			contestWhere.push(eq(contests.visibility, "public"));
		}
	}

	const [contestRow, practiceRow] = await Promise.all([
		db
			.select({ n: count() })
			.from(contests)
			.where(and(...contestWhere)),
		db
			.select({ n: count() })
			.from(practices)
			.where(and(lte(practices.startTime, now), gte(practices.endTime, now))),
	]);

	return {
		contestCount: contestRow[0].n,
		practiceCount: practiceRow[0].n,
	};
}
