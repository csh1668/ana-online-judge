import { count, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { siteSettings, users } from "@/db/schema";

export const REGISTRATION_OPEN_KEY = "registration_open";

// 회원가입 가능 여부 확인
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
