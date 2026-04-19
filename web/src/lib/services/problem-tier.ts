import { eq } from "drizzle-orm";
import { db } from "@/db";
import { problems, problemVotes } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 현재 problem_votes로부터 문제 티어를 재계산해 problems.tier/tierUpdatedAt에 반영한다.
 * - not_ratable 의견(level === null)이 과반이면 tier = -1
 * - 의견 0개면 tier = 0 (unrated)
 * - 그 외: 위/아래 10% 절사(의견 > 5개일 때만) → 시간 가중평균 → round → clamp(1,30)
 * 반환: 새 tier 정수
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
