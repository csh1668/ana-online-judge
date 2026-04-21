import "server-only";

import { headers } from "next/headers";
import { verifyTurnstileToken } from "@/lib/turnstile";

export class CaptchaRequiredError extends Error {
	constructor(message = "CAPTCHA 검증이 필요합니다.") {
		super(message);
		this.name = "CaptchaRequiredError";
	}
}

async function extractClientIp(): Promise<string | undefined> {
	const h = await headers();
	const forwarded = h.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0]?.trim();
		if (first) return first;
	}
	return h.get("x-real-ip") ?? undefined;
}

export async function assertTurnstile(token: string | null | undefined): Promise<void> {
	const ip = await extractClientIp();
	const ok = await verifyTurnstileToken(token, ip);
	if (!ok) {
		throw new CaptchaRequiredError("CAPTCHA 검증에 실패했습니다. 새로고침 후 다시 시도해주세요.");
	}
}
