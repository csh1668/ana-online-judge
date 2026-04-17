import { auth } from "@/auth";

/**
 * Require the current user to be logged in. Returns userId + admin flag.
 * Quota enforcement is NOT done here — it happens at creation time in
 * `assertCanCreateWorkshop`.
 */
export async function requireWorkshopAccess(): Promise<{ userId: number; isAdmin: boolean }> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("로그인이 필요합니다");
	}
	const userId = Number.parseInt(session.user.id, 10);
	const isAdmin = session.user.role === "admin";
	return { userId, isAdmin };
}
