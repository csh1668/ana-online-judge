import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Require the current user to have workshop access (admin OR users.workshopAccess=true).
 * Throws on failure. Returns the userId on success.
 */
export async function requireWorkshopAccess(): Promise<{ userId: number; isAdmin: boolean }> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("로그인이 필요합니다");
	}
	const userId = Number.parseInt(session.user.id, 10);
	const isAdmin = session.user.role === "admin";
	if (isAdmin) {
		return { userId, isAdmin: true };
	}
	const [row] = await db
		.select({ workshopAccess: users.workshopAccess })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!row?.workshopAccess) {
		throw new Error("창작마당 접근 권한이 없습니다");
	}
	return { userId, isAdmin: false };
}
