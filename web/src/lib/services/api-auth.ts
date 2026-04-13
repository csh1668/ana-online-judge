import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSiteSetting } from "./settings";

export const API_KEY_SETTING_KEY = "admin_api_key";

export async function requireApiKey(request: Request): Promise<NextResponse | null> {
	const authHeader = request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return NextResponse.json({ error: "Missing API key" }, { status: 401 });
	}

	const apiKey = authHeader.slice(7);
	const storedKey = await getSiteSetting(API_KEY_SETTING_KEY);

	if (!storedKey) {
		return NextResponse.json(
			{ error: "API key not configured. Set it in admin settings." },
			{ status: 503 }
		);
	}

	const apiKeyBuf = Buffer.from(apiKey, "utf-8");
	const storedKeyBuf = Buffer.from(storedKey, "utf-8");
	if (apiKeyBuf.length !== storedKeyBuf.length || !timingSafeEqual(apiKeyBuf, storedKeyBuf)) {
		return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
	}

	return null; // auth passed
}

export function jsonError(message: string, status: number = 400) {
	return NextResponse.json({ error: message }, { status });
}

export function jsonSuccess<T>(data: T, status: number = 200) {
	return NextResponse.json(data, { status });
}
