import "server-only";

import { and, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { getRedisClient } from "@/lib/redis";
import { acquireRedisLock, releaseRedisLock } from "@/lib/redis-lock";
import {
	ANIGMA_RESULT_KEY_PREFIX,
	type JudgeResult,
	processJudgeResult,
	RESULT_KEY_PREFIX,
} from "@/lib/redis-subscriber";
import { markSubmissionLost, requeueLostSubmission } from "@/lib/services/judge-recovery";

const SWEEP_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = 2 * 60_000;
const SWEEP_BATCH = 50;
const MAX_WORKERS = 10; // judge/src/infra/redis_manager.rs MAX_WORKERS와 동기화
const SWEEP_TIME_BUDGET_MS = 40_000; // 락 TTL(55s)보다 여유를 두고 중단 — 나머지는 다음 사이클에서 처리

let timer: NodeJS.Timeout | null = null;

export function startJudgeReconciler(): void {
	if (timer) return;
	timer = setInterval(() => {
		sweep().catch((e) => console.error("[judge-reconciler] sweep failed:", e));
	}, SWEEP_INTERVAL_MS);
	console.log("[judge-reconciler] started");
}

export function stopJudgeReconciler(): void {
	if (timer) clearInterval(timer);
	timer = null;
}

async function sweep(): Promise<void> {
	const lock = await acquireRedisLock("judge:reconcile", 55);
	if (!lock) return; // 다른 인스턴스가 수행 중

	const sweepStart = Date.now();

	try {
		const stale = await db
			.select({ id: submissions.id })
			.from(submissions)
			.where(
				and(
					inArray(submissions.verdict, ["pending", "judging"]),
					lt(submissions.createdAt, new Date(Date.now() - STALE_THRESHOLD_MS))
				)
			)
			.limit(SWEEP_BATCH);
		if (stale.length === 0) return;

		const redis = await getRedisClient();

		// 큐/처리 중 리스트에 있는 submission_id 집합
		const inFlight = new Set<number>();
		const listKeys = [
			"judge:queue",
			...Array.from({ length: MAX_WORKERS }, (_, i) => `judge:processing:${i}`),
		];
		for (const key of listKeys) {
			const items = await redis.lrange(key, 0, -1);
			for (const item of items) {
				try {
					const parsed = JSON.parse(item);
					if (typeof parsed.submission_id === "number") inFlight.add(parsed.submission_id);
				} catch {
					// judge:dead 후보 — reconciler 관심사 아님
				}
			}
		}

		for (let i = 0; i < stale.length; i++) {
			if (Date.now() - sweepStart > SWEEP_TIME_BUDGET_MS) {
				console.warn(
					`[judge-reconciler] time budget exceeded, deferring ${stale.length - i} submission(s) to next sweep`
				);
				break;
			}

			const { id } = stale[i];
			try {
				// 1) Redis 결과 키 회수 (pub/sub 유실 케이스)
				const judgeKey = `${RESULT_KEY_PREFIX}${id}`;
				const anigmaKey = `${ANIGMA_RESULT_KEY_PREFIX}${id}`;
				const [judgeRaw, anigmaRaw] = [await redis.get(judgeKey), await redis.get(anigmaKey)];
				const raw = judgeRaw ?? anigmaRaw;
				if (raw) {
					const staleKey = judgeRaw ? judgeKey : anigmaKey;
					let result: JudgeResult;
					try {
						result = JSON.parse(raw);
					} catch (parseError) {
						console.warn(
							`[judge-reconciler] corrupted result key for submission ${id}, deleting`,
							parseError
						);
						await redis.del(staleKey);
						continue;
					}
					console.log(`[judge-reconciler] recovering lost result for submission ${id}`);
					await processJudgeResult(result, judgeRaw ? "judge" : "anigma");
					await redis.del(staleKey);
					continue;
				}

				// 2) 아직 큐/워커에 있으면 대기
				if (inFlight.has(id)) continue;

				// 3) 완전 유실 — 1회 재큐, 그 이상은 system_error 확정
				const counterKey = `judge:web_requeue:${id}`;
				const count = await redis.incr(counterKey);
				if (count === 1) await redis.expire(counterKey, 86_400);

				if (count <= 1) {
					console.warn(`[judge-reconciler] requeueing lost submission ${id}`);
					const result = await requeueLostSubmission(id);
					if (result === "cannot_rebuild") {
						await markSubmissionLost(id);
					} else if (result === "already_final") {
						console.log(
							`[judge-reconciler] submission ${id} already finalized before requeue, skipping`
						);
					}
				} else {
					console.warn(`[judge-reconciler] marking submission ${id} as lost`);
					await markSubmissionLost(id);
				}
			} catch (error) {
				console.error(`[judge-reconciler] failed to reconcile submission ${id}`, error);
			}
		}
	} finally {
		await releaseRedisLock(lock);
	}
}
