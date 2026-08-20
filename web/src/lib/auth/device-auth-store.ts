import "server-only";
import { getRedisClient } from "@/lib/redis";

export const DEVICE_CODE_TTL_SECONDS = 600; // 10분
export const POLL_MIN_INTERVAL_SECONDS = 5;

export type DeviceAuthStatus = "pending" | "approved" | "denied";

export interface DeviceAuthRecord {
	userCode: string;
	userId: number | null;
	status: DeviceAuthStatus;
	approvedAt?: string; // ISO
}

function recordKey(deviceCode: string): string {
	return `aoj:device_auth:${deviceCode}`;
}

function userCodeKey(userCode: string): string {
	return `aoj:device_auth:user_code:${userCode}`;
}

function pollKey(deviceCode: string): string {
	return `aoj:device_auth:poll:${deviceCode}`;
}

export async function createDeviceAuth(deviceCode: string, userCode: string): Promise<void> {
	const redis = await getRedisClient();
	const record: DeviceAuthRecord = {
		userCode,
		userId: null,
		status: "pending",
	};
	const pipeline = redis.multi();
	pipeline.set(recordKey(deviceCode), JSON.stringify(record), "EX", DEVICE_CODE_TTL_SECONDS);
	pipeline.set(userCodeKey(userCode), deviceCode, "EX", DEVICE_CODE_TTL_SECONDS);
	await pipeline.exec();
}

export async function getDeviceAuth(deviceCode: string): Promise<DeviceAuthRecord | null> {
	const redis = await getRedisClient();
	const raw = await redis.get(recordKey(deviceCode));
	if (!raw) return null;
	return JSON.parse(raw) as DeviceAuthRecord;
}

export async function getDeviceAuthByUserCode(
	userCode: string
): Promise<{ deviceCode: string; record: DeviceAuthRecord } | null> {
	const redis = await getRedisClient();
	const deviceCode = await redis.get(userCodeKey(userCode));
	if (!deviceCode) return null;
	const record = await getDeviceAuth(deviceCode);
	if (!record) return null;
	return { deviceCode, record };
}

export async function approveDeviceAuth(deviceCode: string, userId: number): Promise<boolean> {
	const redis = await getRedisClient();
	const ttl = await redis.ttl(recordKey(deviceCode));
	if (ttl <= 0) return false;
	const record = await getDeviceAuth(deviceCode);
	if (record?.status !== "pending") return false;
	const updated: DeviceAuthRecord = {
		...record,
		status: "approved",
		userId,
		approvedAt: new Date().toISOString(),
	};
	await redis.set(recordKey(deviceCode), JSON.stringify(updated), "EX", ttl);
	return true;
}

export async function denyDeviceAuth(deviceCode: string): Promise<boolean> {
	const redis = await getRedisClient();
	const ttl = await redis.ttl(recordKey(deviceCode));
	if (ttl <= 0) return false;
	const record = await getDeviceAuth(deviceCode);
	if (record?.status !== "pending") return false;
	const updated: DeviceAuthRecord = { ...record, status: "denied" };
	await redis.set(recordKey(deviceCode), JSON.stringify(updated), "EX", ttl);
	return true;
}

export async function consumeDeviceAuth(deviceCode: string): Promise<void> {
	const redis = await getRedisClient();
	const record = await getDeviceAuth(deviceCode);
	const pipeline = redis.multi();
	pipeline.del(recordKey(deviceCode));
	if (record) pipeline.del(userCodeKey(record.userCode));
	pipeline.del(pollKey(deviceCode));
	await pipeline.exec();
}

/**
 * Polling rate limit. true = 호출 허용, false = 너무 빠름 (slow_down 응답해야 함).
 */
export async function recordPoll(deviceCode: string): Promise<boolean> {
	const redis = await getRedisClient();
	const key = pollKey(deviceCode);
	const result = await redis.set(key, "1", "EX", POLL_MIN_INTERVAL_SECONDS, "NX");
	return result === "OK";
}
