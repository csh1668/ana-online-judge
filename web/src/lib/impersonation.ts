import "server-only";

import { cookies } from "next/headers";

const COOKIE_NAME = "impersonation";

export async function setImpersonationCookie(targetUserId: number) {
	const cookieStore = await cookies();
	cookieStore.set(COOKIE_NAME, String(targetUserId), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
	});
}

export async function getImpersonationTarget(): Promise<number | null> {
	const cookieStore = await cookies();
	const value = cookieStore.get(COOKIE_NAME)?.value;
	if (!value) return null;
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export async function clearImpersonationCookie() {
	const cookieStore = await cookies();
	cookieStore.delete(COOKIE_NAME);
}
