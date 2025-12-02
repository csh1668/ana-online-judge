import "server-only";

import { Redis } from "ioredis";
import { serverEnv } from "@/lib/env";

let redis: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
	if (!redis) {
		redis = new Redis(serverEnv.REDIS_URL, {
			maxRetriesPerRequest: null,
			lazyConnect: true,
		});
		await redis.connect();
	}
	return redis;
}

export async function closeRedisConnection(): Promise<void> {
	if (redis) {
		await redis.quit();
		redis = null;
	}
}
