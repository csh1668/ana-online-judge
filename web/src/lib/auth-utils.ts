import { auth } from "@/auth";

/**
 * 관리자 권한 확인 헬퍼 함수
 * @throws {Error} 권한이 없는 경우 에러 발생
 * @returns 세션의 사용자 정보
 */
export async function requireAdmin() {
	const session = await auth();
	if (!session?.user || session.user.role !== "admin") {
		throw new Error("관리자 권한이 필요합니다");
	}
	return session.user;
}

/**
 * 로그인 확인 헬퍼 함수
 * @throws {Error} 로그인하지 않은 경우 에러 발생
 * @returns 세션의 사용자 정보
 */
export async function requireAuth() {
	const session = await auth();
	if (!session?.user) {
		throw new Error("로그인이 필요합니다");
	}
	return session.user;
}
