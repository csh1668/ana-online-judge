"use server";

import { and, asc, count, desc, eq, gte, inArray, lte, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type ContestVisibility,
	contestParticipants,
	contestProblems,
	contests,
	problems,
} from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";
import { col } from "@/lib/db-helpers";

type AdminContestsSort = "id" | "startTime";

// Get Contests (with filters)
export async function getContests(options?: {
	page?: number;
	limit?: number;
	search?: string;
	visibility?: ContestVisibility;
	status?: "upcoming" | "running" | "finished";
	sort?: AdminContestsSort;
	order?: "asc" | "desc";
}) {
	const { userId, isAdmin } = await getSessionInfo();
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const sort = options?.sort ?? "startTime";
	const order = options?.order ?? "desc";

	const whereConditions: SQL[] = [];

	// Filter by visibility (admins can see all, users see public or private contests they're registered for)
	if (!isAdmin) {
		if (userId) {
			// Get contest IDs where user is registered
			const registeredContests = await db
				.select({ contestId: contestParticipants.contestId })
				.from(contestParticipants)
				.where(eq(contestParticipants.userId, userId));

			const registeredContestIds = registeredContests.map((r) => r.contestId);

			// Show public contests OR private contests where user is registered
			if (registeredContestIds.length > 0) {
				const visClause = or(
					eq(contests.visibility, "public"),
					and(eq(contests.visibility, "private"), inArray(contests.id, registeredContestIds))
				);
				if (visClause) whereConditions.push(visClause);
			} else {
				// No registered contests, only show public
				whereConditions.push(eq(contests.visibility, "public"));
			}
		} else {
			// Not logged in, only show public
			whereConditions.push(eq(contests.visibility, "public"));
		}
	} else if (options?.visibility) {
		// Admin filtering by visibility
		whereConditions.push(eq(contests.visibility, options.visibility));
	}

	if (options?.search) {
		whereConditions.push(sql`${contests.title} ILIKE ${`%${options.search.trim()}%`}`);
	}

	// Filter by status
	const now = new Date();
	if (options?.status === "upcoming") {
		whereConditions.push(gte(contests.startTime, now));
	} else if (options?.status === "running") {
		whereConditions.push(lte(contests.startTime, now));
		whereConditions.push(gte(contests.endTime, now));
	} else if (options?.status === "finished") {
		whereConditions.push(lte(contests.endTime, now));
	}

	const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

	// 외부 ${contests.id} 는 col()로 감싸 prefix-stripping을 막는다.
	const participantCountSql = sql<number>`(
		SELECT COUNT(*)::int FROM contest_participants
		WHERE contest_participants.contest_id = ${col(contests, contests.id)}
	)`;
	const problemCountSql = sql<number>`(
		SELECT COUNT(*)::int FROM contest_problems
		WHERE contest_problems.contest_id = ${col(contests, contests.id)}
	)`;

	let orderBy: SQL;
	switch (sort) {
		case "id":
			orderBy = order === "asc" ? asc(contests.id) : desc(contests.id);
			break;
		default:
			orderBy = order === "asc" ? asc(contests.startTime) : desc(contests.startTime);
			break;
	}

	const [contestsList, totalResult] = await Promise.all([
		db
			.select({
				id: contests.id,
				title: contests.title,
				visibility: contests.visibility,
				scoreboardType: contests.scoreboardType,
				startTime: contests.startTime,
				endTime: contests.endTime,
				participantCount: participantCountSql.as("participant_count"),
				problemCount: problemCountSql.as("problem_count"),
			})
			.from(contests)
			.where(whereClause)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(contests).where(whereClause),
	]);

	return {
		contests: contestsList,
		total: totalResult[0].count,
	};
}

// Get Contest by ID

export async function getContestById(id: number) {
	const { userId, isAdmin } = await getSessionInfo();

	const [contest] = await db.select().from(contests).where(eq(contests.id, id)).limit(1);

	if (!contest) {
		return null;
	}

	// Check visibility

	if (contest.visibility === "private") {
		// Admins can always see private contests

		if (isAdmin) {
			// Continue to load contest
		} else if (userId) {
			// Check if user is registered for this contest

			const [participant] = await db

				.select()

				.from(contestParticipants)

				.where(and(eq(contestParticipants.contestId, id), eq(contestParticipants.userId, userId)))

				.limit(1);

			// If not registered, deny access

			if (!participant) {
				return null;
			}
		} else {
			// Not logged in, deny access

			return null;
		}
	}

	// Get contest problems with problem details
	const contestProblemsList = await db
		.select({
			id: contestProblems.id,
			label: contestProblems.label,
			order: contestProblems.order,
			problem: {
				id: problems.id,
				title: problems.displayTitle,
				maxScore: problems.maxScore,
				problemType: problems.problemType,
				judgeAvailable: problems.judgeAvailable,
				languageRestricted: sql<boolean>`${problems.allowedLanguages} IS NOT NULL`,
				hasSubtasks: problems.hasSubtasks,
				tier: problems.tier,
			},
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(eq(contestProblems.contestId, id))
		.orderBy(contestProblems.order);

	return {
		...contest,
		problems: contestProblemsList,
	};
}

export type GetContestsReturn = Awaited<ReturnType<typeof getContests>>;
export type ContestListItem = GetContestsReturn["contests"][number];
export type GetContestByIdReturn = Awaited<ReturnType<typeof getContestById>>;
