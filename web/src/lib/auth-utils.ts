import { count, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { siteSettings, users } from "@/db/schema";
import { serverEnv } from "./env";

export const REGISTRATION_OPEN_KEY = "registration_open";
export const GOOGLE_REGISTRATION_OPEN_KEY = "google_registration_open";

// 구글 OAuth가 설정되어 있는지 확인
export function hasGoogleOAuth(): boolean {
	return !!(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET);
}

// 일반 회원가입 가능 여부 확인
export async function isRegistrationOpen(): Promise<boolean> {
	const setting = await db
		.select()
		.from(siteSettings)
		.where(eq(siteSettings.key, REGISTRATION_OPEN_KEY))
		.limit(1);

	// 설정이 없으면 기본적으로 열려있음
	if (setting.length === 0) return true;

	return setting[0].value === "true";
}

// 구글 회원가입 가능 여부 확인
export async function isGoogleRegistrationOpen(): Promise<boolean> {
	const hasGoogleClientId = !!serverEnv.GOOGLE_CLIENT_ID;
	const hasGoogleClientSecret = !!serverEnv.GOOGLE_CLIENT_SECRET;

	if (!hasGoogleClientId || !hasGoogleClientSecret) return false;

	const setting = await db
		.select()
		.from(siteSettings)
		.where(eq(siteSettings.key, GOOGLE_REGISTRATION_OPEN_KEY))
		.limit(1);

	if (setting.length === 0) return true;

	return setting[0].value === "true";
}

// 첫 번째 사용자인지 확인
export async function isFirstUser(): Promise<boolean> {
	const result = await db.select({ count: count() }).from(users);
	return result[0].count === 0;
}

// 관리자 권한 확인
export async function requireAdmin() {
	const session = await auth();

	if (!session?.user || session.user.role !== "admin") {
		throw new Error("Unauthorized");
	}

	return session.user;
}

// 세션에서 userId를 안전하게 파싱 (null 허용)
export function parseSessionUserId(session: { user?: { id?: string } } | null): number | null {
	return session?.user?.id ? parseInt(session.user.id, 10) : null;
}

// 인증 필수 — userId 반환 (미인증 시 throw)
export async function requireAuth() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("로그인이 필요합니다");
	return { session, userId: parseInt(session.user.id, 10) };
}

// 세션 정보 일괄 조회 (non-throwing)
export async function getSessionInfo() {
	const session = await auth();
	const userId = parseSessionUserId(session);
	const isAdmin = session?.user?.role === "admin";
	return { session, userId, isAdmin };
}
