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
 * Run `fn` under a Redis SET NX EX lock. Throws WorkshopLockBusyError when the
 * lock is already held. Release is owner-checked (token compare) so an expired
 * lock re-acquired by another holder is never deleted by us.
 */
export async function withWorkshopLock<T>(
	key: string,
	ttlSec: number,
	fn: () => Promise<T>
): Promise<T> {
	const redis = await getRedisClient();
	const token = randomUUID();
	const ok = await redis.set(key, token, "EX", ttlSec, "NX");
	if (ok !== "OK") throw new WorkshopLockBusyError();
	try {
		return await fn();
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
