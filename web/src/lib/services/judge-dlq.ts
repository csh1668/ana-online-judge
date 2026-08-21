import "server-only";

import { createHash } from "node:crypto";
import { getRedisClient } from "@/lib/redis";

/**
 * judge:dead — 워커를 반복적으로 죽였거나(poison) 파싱 불가능해 격리된 job들의
 * dead letter 큐. judge 쪽 reclaim 로직(judge/src/infra/redis_manager.rs)이 적재하고,
 * 여기서는 관리자 페이지 노출·재큐·삭제만 담당한다.
 */
const DEAD_QUEUE_KEY = "judge:dead";
const JUDGE_QUEUE_KEY = "judge:queue";

export interface DeadLetterEntry {
	index: number;
	/** payload sha256 hex — 행 식별자이자 judge의 requeue 카운터 키(judge:requeue:{fp})와 동일 지문 */
	fingerprint: string;
	jobType: string;
	submissionId: number | null;
	problemId: number | null;
	jobId: string | null;
	sizeBytes: number;
	preview: string;
}

function fingerprint(raw: string): string {
	return createHash("sha256").update(raw).digest("hex");
}

export async function listDeadLetterJobs(): Promise<DeadLetterEntry[]> {
	const redis = await getRedisClient();
	const items = await redis.lrange(DEAD_QUEUE_KEY, 0, -1);

	return items.map((raw, index) => {
		let jobType = "(파싱 불가)";
		let submissionId: number | null = null;
		let problemId: number | null = null;
		let jobId: string | null = null;
		try {
			const parsed = JSON.parse(raw);
			if (typeof parsed.job_type === "string") jobType = parsed.job_type;
			if (typeof parsed.submission_id === "number") submissionId = parsed.submission_id;
			if (typeof parsed.problem_id === "number") problemId = parsed.problem_id;
			if (typeof parsed.job_id === "string") jobId = parsed.job_id;
		} catch {
			// 파싱 불가 payload도 그대로 노출한다 (jobType 기본값 유지)
		}

		return {
			index,
			fingerprint: fingerprint(raw),
			jobType,
			submissionId,
			problemId,
			jobId,
			sizeBytes: Buffer.byteLength(raw, "utf8"),
			preview: raw.slice(0, 160),
		};
	});
}

export async function countDeadLetterJobs(): Promise<number> {
	const redis = await getRedisClient();
	return redis.llen(DEAD_QUEUE_KEY);
}

/**
 * index의 payload를 다시 읽어 지문이 일치할 때만 반환한다.
 * 그 사이 목록이 바뀌었으면(다른 관리자의 처리 등) null — 호출자는 새로고침을 안내한다.
 */
async function resolveEntry(index: number, fp: string): Promise<string | null> {
	const redis = await getRedisClient();
	const raw = await redis.lindex(DEAD_QUEUE_KEY, index);
	if (raw === null || fingerprint(raw) !== fp) return null;
	return raw;
}

export type DlqActionResult = { ok: true } | { ok: false; error: string };

const STALE_ENTRY_ERROR = "항목을 찾을 수 없습니다. 목록이 변경되었으니 새로고침해 주세요.";

/** dead job을 채점 큐 앞에 되돌린다. poison 카운터도 초기화해 즉시 재격리되지 않게 한다. */
export async function requeueDeadLetterJob(index: number, fp: string): Promise<DlqActionResult> {
	const raw = await resolveEntry(index, fp);
	if (raw === null) return { ok: false, error: STALE_ENTRY_ERROR };

	const redis = await getRedisClient();
	await redis.del(`judge:requeue:${fp}`);
	await redis.lpush(JUDGE_QUEUE_KEY, raw);
	await redis.lrem(DEAD_QUEUE_KEY, 1, raw);
	return { ok: true };
}

/** dead job을 영구 삭제한다. */
export async function deleteDeadLetterJob(index: number, fp: string): Promise<DlqActionResult> {
	const raw = await resolveEntry(index, fp);
	if (raw === null) return { ok: false, error: STALE_ENTRY_ERROR };

	const redis = await getRedisClient();
	await redis.lrem(DEAD_QUEUE_KEY, 1, raw);
	return { ok: true };
}
