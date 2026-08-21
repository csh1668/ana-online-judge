import { randomUUID } from "node:crypto";
import { getRedisClient } from "@/lib/redis";

export class WorkshopLockBusyError extends Error {
	constructor(message = "다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.") {
		super(message);
		this.name = "WorkshopLockBusyError";
	}
}

export function draftOpLockKey(draftId: number): string {
	return `workshop:draft:${draftId}:op-lock`;
}

export function publishLockKey(workshopProblemId: number): string {
	return `workshop:publish:${workshopProblemId}`;
}

/** True if someone currently holds `key`. Advisory read for fast-fail guards. */
export async function isWorkshopLockHeld(key: string): Promise<boolean> {
	const redis = await getRedisClient();
	return (await redis.exists(key)) === 1;
}

/**
 * Fast-fail while a rollback/update holds `draftId`'s op-lock (Task 12). Used
 * at the start of every service function that writes files under the draft's
 * MinIO prefix (job creators AND direct editor writes — testcases, solutions,
 * generators, resources, checker, validator) so the rollback wipe window is
 * protected against all draft file writers, not just judge-job creators.
 *
 * This is a plain check-then-act read, not a lock acquisition, so it has a
 * race window against a rollback that acquires the lock right after this
 * check passes — accepted; see call sites for why the write that slips
 * through in that window doesn't corrupt the rollback.
 */
export async function assertDraftNotLocked(draftId: number): Promise<void> {
	if (await isWorkshopLockHeld(draftOpLockKey(draftId))) {
		throw new Error("드래프트 롤백/업데이트가 진행 중입니다. 잠시 후 다시 시도하세요.");
	}
}

/** Passed to the callback of `withWorkshopLock` so long-running holders can
 * re-check ownership before a destructive step (the lock has a TTL and is
 * never renewed, so a slow holder can outlive it). */
export type WorkshopLockContext = {
	/** True if we (this call's token) still hold `key` in Redis. */
	stillOwned: () => Promise<boolean>;
};

/**
 * Run `fn` under a Redis SET NX EX lock. Throws WorkshopLockBusyError when the
 * lock is already held. Release is owner-checked (token compare) so an expired
 * lock re-acquired by another holder is never deleted by us.
 */
export async function withWorkshopLock<T>(
	key: string,
	ttlSec: number,
	fn: (ctx: WorkshopLockContext) => Promise<T>
): Promise<T> {
	const redis = await getRedisClient();
	const token = randomUUID();
	const ok = await redis.set(key, token, "EX", ttlSec, "NX");
	if (ok !== "OK") throw new WorkshopLockBusyError();
	const stillOwned = async () => (await redis.get(key)) === token;
	try {
		return await fn({ stillOwned });
	} finally {
		const releaseScript =
			"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
		try {
			await redis.eval(releaseScript, 1, key, token);
		} catch {
			// best-effort release — the TTL expires the lock anyway
		}
	}
}
