import "server-only";

import { JUDGE_PRIORITY_LEVELS, queueKeyFor } from "@/lib/judge-priority";
import { getRedisClient } from "@/lib/redis";
import { countDeadLetterJobs } from "@/lib/services/judge-dlq";

// judge/src/infra/redis_manager.rs JUDGE_MAX_WORKERS(기본 10)와 동기화 — judge-reconciler.ts와 동일 패턴
const parsedMaxWorkers = Number(process.env.JUDGE_MAX_WORKERS ?? "10");
const MAX_WORKERS =
	Number.isFinite(parsedMaxWorkers) && parsedMaxWorkers > 0 ? parsedMaxWorkers : 10;

export interface JudgeQueueStatus {
	online: boolean; // 살아있는 워커 ≥ 1
	workersOnline: number; // EXISTS judge:worker:lease:{0..JUDGE_MAX_WORKERS-1} 카운트
	inFlight: number; // Σ LLEN judge:processing:{i}
	queuedByPriority: Record<string, number>; // { "2": n, "1": n, "0": n, "-1": n, "-2": n } — LLEN judge:queue:p{n}
	queuedTotal: number;
	deadLetters: number; // LLEN judge:dead (참고 지표)
	checkedAt: string; // ISO
}

function emptyStatus(checkedAt: string): JudgeQueueStatus {
	return {
		online: false,
		workersOnline: 0,
		inFlight: 0,
		queuedByPriority: Object.fromEntries(JUDGE_PRIORITY_LEVELS.map((p) => [String(p), 0])),
		queuedTotal: 0,
		deadLetters: 0,
		checkedAt,
	};
}

/** 개별 Redis 명령 실패는 이 상태 페이지 전체를 죽이지 않도록 0으로 폴백한다. */
async function safeCount(fn: () => Promise<number>): Promise<number> {
	try {
		return await fn();
	} catch (e) {
		console.error("[judge-status] redis command failed:", e);
		return 0;
	}
}

/**
 * 채점 큐 상태 스냅샷. Redis 연결 자체가 실패해도 throw하지 않고
 * online: false인 빈 상태를 반환한다 — 상태 페이지는 장애 중에도 떠야 한다.
 */
export async function getJudgeQueueStatus(): Promise<JudgeQueueStatus> {
	const checkedAt = new Date().toISOString();

	let redis: Awaited<ReturnType<typeof getRedisClient>>;
	try {
		redis = await getRedisClient();
	} catch (e) {
		console.error("[judge-status] redis connection failed:", e);
		return emptyStatus(checkedAt);
	}

	const [workerFlags, processingCounts, queueCounts, deadLetters] = await Promise.all([
		Promise.all(
			Array.from({ length: MAX_WORKERS }, (_, i) =>
				safeCount(() => redis.exists(`judge:worker:lease:${i}`))
			)
		),
		Promise.all(
			Array.from({ length: MAX_WORKERS }, (_, i) =>
				safeCount(() => redis.llen(`judge:processing:${i}`))
			)
		),
		Promise.all(JUDGE_PRIORITY_LEVELS.map((p) => safeCount(() => redis.llen(queueKeyFor(p))))),
		safeCount(() => countDeadLetterJobs()),
	]);

	const workersOnline = workerFlags.reduce((sum, v) => sum + v, 0);
	const inFlight = processingCounts.reduce((sum, v) => sum + v, 0);

	const queuedByPriority: Record<string, number> = {};
	JUDGE_PRIORITY_LEVELS.forEach((p, idx) => {
		queuedByPriority[String(p)] = queueCounts[idx];
	});
	const queuedTotal = queueCounts.reduce((sum, v) => sum + v, 0);

	return {
		online: workersOnline >= 1,
		workersOnline,
		inFlight,
		queuedByPriority,
		queuedTotal,
		deadLetters,
		checkedAt,
	};
}
