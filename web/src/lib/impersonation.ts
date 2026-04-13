import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

const COOKIE_NAME = "impersonation";
const MAX_AGE = 60 * 60 * 1; // 1시간

function getSecret(): string {
	return serverEnv.NEXTAUTH_SECRET || "dev-secret";
}

function signValue(userId: string): string {
	const signature = createHmac("sha256", getSecret()).update(userId).digest("hex");
	return `${userId}.${signature}`;
}

function verifyAndExtract(cookieValue: string): number | null {
	const dotIndex = cookieValue.indexOf(".");
	if (dotIndex === -1) return null;

	const userId = cookieValue.substring(0, dotIndex);
	const signature = cookieValue.substring(dotIndex + 1);

	const expected = createHmac("sha256", getSecret()).update(userId).digest("hex");

	const sigBuf = Buffer.from(signature, "utf-8");
	const expBuf = Buffer.from(expected, "utf-8");
	if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
		return null;
	}

	const parsed = Number.parseInt(userId, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export async function setImpersonationCookie(targetUserId: number) {
	const cookieStore = await cookies();
	cookieStore.set(COOKIE_NAME, signValue(String(targetUserId)), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: MAX_AGE,
	});
}

export async function getImpersonationTarget(): Promise<number | null> {
	const cookieStore = await cookies();
	const value = cookieStore.get(COOKIE_NAME)?.value;
	if (!value) return null;
	return verifyAndExtract(value);
}

export async function clearImpersonationCookie() {
	const cookieStore = await cookies();
	cookieStore.delete(COOKIE_NAME);
}
