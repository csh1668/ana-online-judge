import "server-only";

import { serverEnv } from "@/lib/env";

type SiteVerifyResponse = {
	success: boolean;
	"error-codes"?: string[];
	hostname?: string;
	action?: string;
	cdata?: string;
};

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
	token: string | null | undefined,
	clientIp?: string | null
): Promise<boolean> {
	if (!token) return false;

	const secret = serverEnv.TURNSTILE_SECRET_KEY;
	if (!secret) {
		return serverEnv.NODE_ENV !== "production";
	}

	const body = new URLSearchParams({ secret, response: token });
	if (clientIp) body.append("remoteip", clientIp);

	try {
		const res = await fetch(SITEVERIFY_URL, {
			method: "POST",
			body,
			cache: "no-store",
		});
		if (!res.ok) return false;
		const data = (await res.json()) as SiteVerifyResponse;
		return data.success === true;
	} catch (error) {
		console.error("Turnstile verify failed:", error);
		return false;
	}
}
