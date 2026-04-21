import "server-only";

import { getRedisClient } from "@/lib/redis";
import { CaptchaRequiredError } from "@/lib/turnstile-guard";

export const SUBMIT_TICKET_TTL_SECONDS = 600;

function ticketKey(userId: number): string {
	return `turnstile:submit:${userId}`;
}

export async function issueSubmitTicket(userId: number): Promise<{ expiresAt: number }> {
	const redis = await getRedisClient();
	const key = ticketKey(userId);
	await redis.set(key, "1", "EX", SUBMIT_TICKET_TTL_SECONDS);
	return { expiresAt: Date.now() + SUBMIT_TICKET_TTL_SECONDS * 1000 };
}

export async function getSubmitTicketTtl(userId: number): Promise<number> {
	const redis = await getRedisClient();
	const ttl = await redis.ttl(ticketKey(userId));
	return ttl > 0 ? ttl : 0;
}

export async function hasSubmitTicket(userId: number): Promise<boolean> {
	const redis = await getRedisClient();
	const exists = await redis.exists(ticketKey(userId));
	return exists === 1;
}

export async function assertSubmitTicket(userId: number): Promise<void> {
	if (!(await hasSubmitTicket(userId))) {
		throw new CaptchaRequiredError("CAPTCHA 검증이 만료되었습니다. 잠시 후 다시 시도해주세요.");
	}
}
