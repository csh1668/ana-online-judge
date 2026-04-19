import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { problems, problemVotes, submissions } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 현재 problem_votes로부터 문제 티어를 재계산해 problems.tier/tierUpdatedAt에 반영한다.
 * - not_ratable 의견(level === null)이 과반이면 tier = -1
 * - 의견 0개면 tier = 0 (unrated)
 * - 그 외: 위/아래 10% 절사(의견 > 5개일 때만) → 시간 가중평균 → round → clamp(1,30)
 * 반환: 새 tier 정수
 *
 * NOTE (single-instance assumption): SELECT votes → UPDATE problems가 트랜잭션/락 없이 수행된다.
 * 단일 Next.js 인스턴스 + in-process 큐 dedup이 직렬화를 담보. 자세한 내용은
 * lib/queue/rating-queue.ts 헤더 주석 참고.
 */
export async function recomputeProblemTier(problemId: number): Promise<number> {
	const votes = await db
		.select({ level: problemVotes.level, updatedAt: problemVotes.updatedAt })
		.from(problemVotes)
		.where(eq(problemVotes.problemId, problemId));

	let newTier = 0;

	if (votes.length === 0) {
		newTier = 0;
	} else {
		const notRatable = votes.filter((v) => v.level === null);
		const ratable = votes.filter((v): v is { level: number; updatedAt: Date } => v.level !== null);

		if (notRatable.length > votes.length / 2) {
			newTier = -1;
		} else if (ratable.length === 0) {
			newTier = 0;
		} else {
			ratable.sort((a, b) => a.level - b.level);
			let trimmed = ratable;
			if (ratable.length > 5) {
				const trim = Math.round(ratable.length * 0.1);
				trimmed = ratable.slice(trim, ratable.length - trim);
			}
			const now = Date.now();
			let wSum = 0;
			let wLevelSum = 0;
			for (const v of trimmed) {
				const days = (now - v.updatedAt.getTime()) / DAY_MS;
				const w = 0.5 ** (days / 365);
				wSum += w;
				wLevelSum += w * v.level;
			}
			const avg = wLevelSum / wSum;
			newTier = Math.min(30, Math.max(1, Math.round(avg)));
		}
	}

	await db
		.update(problems)
		.set({ tier: newTier, tierUpdatedAt: new Date() })
		.where(eq(problems.id, problemId));

	return newTier;
}

/** 현재 저장된 problems.tier 값을 읽는다 (큐에서 before/after 비교용) */
export async function readProblemTier(problemId: number): Promise<number> {
	const [row] = await db
		.select({ tier: problems.tier })
		.from(problems)
		.where(eq(problems.id, problemId))
		.limit(1);
	return row?.tier ?? 0;
}

/**
 * 의견이 1개 이상 있는 모든 문제의 id를 반환.
 * admin "전체 문제 티어 재계산" 또는 프로세스 재시작 후 큐 복원 용도.
 */
export async function listProblemIdsWithVotes(): Promise<number[]> {
	const rows = await db.selectDistinct({ problemId: problemVotes.problemId }).from(problemVotes);
	return rows.map((r) => r.problemId);
}

/** 각 티어(-1,0,1..30)의 공개 문제 수를 집계. 없는 티어는 0으로 채워서 반환. */
export async function countPublicProblemsByTier(): Promise<Map<number, number>> {
	const rows = await db
		.select({ tier: problems.tier, cnt: count() })
		.from(problems)
		.where(eq(problems.isPublic, true))
		.groupBy(problems.tier);

	const map = new Map<number, number>();
	for (let t = -1; t <= 30; t++) map.set(t, 0);
	for (const r of rows) map.set(r.tier, Number(r.cnt));
	return map;
}

export interface ProblemByTierRow {
	id: number;
	title: string;
	problemType: string;
	judgeAvailable: boolean;
	languageRestricted: boolean;
	isPublic: boolean;
	tier: number;
	submissionCount: number;
	acceptedCount: number;
}

export async function listProblemsByTier(
	tier: number,
	options: {
		sort?: "id" | "title" | "acceptedCount" | "submissionCount";
		order?: "asc" | "desc";
		page?: number;
		limit?: number;
	}
): Promise<{ problems: ProblemByTierRow[]; total: number }> {
	const page = options.page ?? 1;
	const limit = options.limit ?? 100;
	const offset = (page - 1) * limit;
	const sort = options.sort ?? "acceptedCount";
	const order = options.order ?? "desc";

	const statsSq = db
		.select({
			problemId: submissions.problemId,
			submissionCount: count().as("sc"),
			acceptedCount:
				sql<number>`count(case when ${submissions.verdict} = 'accepted' then 1 end)`.as("ac"),
		})
		.from(submissions)
		.groupBy(submissions.problemId)
		.as("stats");

	const orderColumn = (() => {
		switch (sort) {
			case "title":
				return order === "asc" ? asc(problems.title) : desc(problems.title);
			case "acceptedCount":
				return order === "asc"
					? sql`COALESCE(${statsSq.acceptedCount}, 0) ASC`
					: sql`COALESCE(${statsSq.acceptedCount}, 0) DESC`;
			case "submissionCount":
				return order === "asc"
					? sql`COALESCE(${statsSq.submissionCount}, 0) ASC`
					: sql`COALESCE(${statsSq.submissionCount}, 0) DESC`;
			default:
				return order === "asc" ? asc(problems.id) : desc(problems.id);
		}
	})();

	const whereCondition = and(eq(problems.tier, tier), eq(problems.isPublic, true));

	const rows = await db
		.select({
			id: problems.id,
			title: problems.title,
			problemType: problems.problemType,
			judgeAvailable: problems.judgeAvailable,
			languageRestricted: sql<boolean>`${problems.allowedLanguages} IS NOT NULL`,
			isPublic: problems.isPublic,
			tier: problems.tier,
			submissionCount: sql<number>`COALESCE(${statsSq.submissionCount}, 0)`,
			acceptedCount: sql<number>`COALESCE(${statsSq.acceptedCount}, 0)`,
		})
		.from(problems)
		.leftJoin(statsSq, eq(problems.id, statsSq.problemId))
		.where(whereCondition)
		.orderBy(orderColumn)
		.limit(limit)
		.offset(offset);

	const totalRow = await db
		.select({ cnt: sql<number>`count(*)::int` })
		.from(problems)
		.where(whereCondition);

	return {
		problems: rows.map((r) => ({ ...r, problemType: r.problemType as string })),
		total: totalRow[0]?.cnt ?? 0,
	};
}
