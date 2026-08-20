import { compare, hash } from "bcryptjs";
import { and, asc, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	playgroundSessions,
	type SubmissionVisibility,
	users,
	workshopProblems,
} from "@/db/schema";
import { generateTempPassword } from "@/lib/auth-utils";
import { userDisplayHandle, userDisplayJoin } from "@/lib/db/user-display";
import { col, tbl } from "@/lib/db-helpers";

type AdminUsersSort = "id" | "createdAt" | "rating" | "submissionCount";

/**
 * admin/users 목록과 공지 수신자 해석이 공유하는 필터(검색/권한/계정유형).
 * where 절 멤버십에 영향을 주는 필드만 포함한다(정렬/페이지는 별도).
 */
export type AdminUsersFilter = {
	search?: string;
	role?: "user" | "admin";
	accountType?: "oauth" | "local";
};

/** admin 사용자 목록과 동일한 where 절을 구성한다. 조건이 없으면 undefined. */
function buildAdminUsersWhere(filter: AdminUsersFilter): SQL | undefined {
	const conditions: SQL[] = [];
	if (filter.search) {
		const term = `%${filter.search.trim()}%`;
		conditions.push(
			or(ilike(users.username, term), ilike(users.name, term), ilike(users.email, term))!
		);
	}
	if (filter.role) conditions.push(eq(users.role, filter.role));
	if (filter.accountType === "oauth") conditions.push(sql`${users.password} IS NULL`);
	else if (filter.accountType === "local") conditions.push(sql`${users.password} IS NOT NULL`);

	return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * 필터에 매칭되는 모든 사용자 id 목록. admin/users 목록과 동일한 where 절을 사용해
 * "필터로 전체 선택" 공지가 목록 페이지와 같은 대상 집합을 갖도록 보장한다.
 */
export async function listAdminUserIds(filter: AdminUsersFilter): Promise<number[]> {
	const whereClause = buildAdminUsersWhere(filter);
	const rows = await db.select({ id: users.id }).from(users).where(whereClause);
	return rows.map((r) => r.id);
}

export async function getAdminUsers(options?: {
	page?: number;
	limit?: number;
	search?: string;
	role?: "user" | "admin";
	accountType?: "oauth" | "local";
	sort?: AdminUsersSort;
	order?: "asc" | "desc";
}) {
	const page = options?.page ?? 1;
	const limit = options?.limit ?? 20;
	const offset = (page - 1) * limit;
	const sort = options?.sort ?? "createdAt";
	const order = options?.order ?? "desc";

	// Correlated subqueries reference the outer `users.id` via `col()` because
	// Drizzle's ${users.id} interpolation strips the table prefix, which would
	// collide with the inner tables' own `id` columns.
	const playgroundUsageSql = sql<number>`(
		SELECT COUNT(*)::int FROM ${tbl(playgroundSessions)}
		WHERE ${col(playgroundSessions, playgroundSessions.userId)} = ${col(users, users.id)}
	)`;
	const workshopUsageSql = sql<number>`(
		SELECT COUNT(*)::int FROM ${tbl(workshopProblems)}
		WHERE ${col(workshopProblems, workshopProblems.createdBy)} = ${col(users, users.id)}
	)`;
	const submissionCountSql = sql<number>`(
		SELECT COUNT(*)::int FROM submissions
		WHERE submissions.user_id = ${col(users, users.id)}
	)`;

	const whereClause = buildAdminUsersWhere({
		search: options?.search,
		role: options?.role,
		accountType: options?.accountType,
	});

	let orderBy: SQL;
	switch (sort) {
		case "id":
			orderBy = order === "asc" ? asc(users.id) : desc(users.id);
			break;
		case "rating":
			orderBy = order === "asc" ? asc(users.rating) : desc(users.rating);
			break;
		case "submissionCount":
			orderBy = order === "asc" ? sql`submission_count ASC` : sql`submission_count DESC`;
			break;
		default:
			orderBy = order === "asc" ? asc(users.createdAt) : desc(users.createdAt);
			break;
	}

	const [usersList, totalResult] = await Promise.all([
		db
			.select({
				id: users.id,
				username: users.username,
				name: users.name,
				email: users.email,
				role: users.role,
				rating: users.rating,
				playgroundQuota: users.playgroundQuota,
				workshopQuota: users.workshopQuota,
				playgroundUsage: playgroundUsageSql,
				workshopUsage: workshopUsageSql,
				submissionCount: submissionCountSql.as("submission_count"),
				hasPassword: sql<boolean>`${users.password} IS NOT NULL`,
				createdAt: users.createdAt,
			})
			.from(users)
			.where(whereClause)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(users).where(whereClause),
	]);

	return {
		users: usersList,
		total: totalResult[0].count,
	};
}

export async function resetUserPassword(userId: number): Promise<{ tempPassword: string }> {
	const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!target) throw new Error("사용자를 찾을 수 없습니다.");
	if (!target.password) throw new Error("OAuth 계정은 비밀번호 초기화 대상이 아닙니다.");

	const tempPassword = generateTempPassword();
	const hashed = await hash(tempPassword, 12);

	await db
		.update(users)
		.set({ password: hashed, mustChangePassword: true, updatedAt: new Date() })
		.where(eq(users.id, userId));

	return { tempPassword };
}

export async function changeOwnPassword(
	userId: number,
	currentPassword: string,
	newPassword: string
): Promise<void> {
	if (!newPassword || newPassword.length < 8) {
		throw new Error("비밀번호는 8자 이상이어야 합니다.");
	}
	if (currentPassword === newPassword) {
		throw new Error("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
	}

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user?.password) throw new Error("사용자를 찾을 수 없습니다.");

	const ok = await compare(currentPassword, user.password);
	if (!ok) throw new Error("현재 비밀번호가 일치하지 않습니다.");

	const hashed = await hash(newPassword, 12);
	await db
		.update(users)
		.set({ password: hashed, mustChangePassword: false, updatedAt: new Date() })
		.where(eq(users.id, userId));
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
	const [updatedUser] = await db
		.update(users)
		.set({ role, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning();

	return updatedUser;
}

export async function deleteUser(userId: number, currentUserId: number) {
	if (currentUserId === userId) {
		throw new Error("자기 자신을 삭제할 수 없습니다.");
	}

	await db.delete(users).where(eq(users.id, userId));

	return { success: true };
}

export async function searchUsers(query: string, limit: number = 20) {
	if (!query || query.trim().length === 0) {
		return [];
	}

	const searchTerm = `%${query.trim()}%`;

	return db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			mainExternalSite: users.mainExternalSite,
			mainExternalRating: userDisplayHandle.rating,
		})
		.from(users)
		.leftJoin(userDisplayJoin.table, userDisplayJoin.on)
		.where(or(ilike(users.username, searchTerm), ilike(users.name, searchTerm)))
		.limit(limit);
}

export async function getUserByUsername(username: string) {
	const [user] = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			bio: users.bio,
			avatarUrl: users.avatarUrl,
			rating: users.rating,
			defaultSubmissionVisibility: users.defaultSubmissionVisibility,
			createdAt: users.createdAt,
			mainExternalSite: users.mainExternalSite,
			mainExternalRating: userDisplayHandle.rating,
		})
		.from(users)
		.leftJoin(userDisplayJoin.table, userDisplayJoin.on)
		.where(eq(users.username, username))
		.limit(1);

	return user ?? null;
}

export async function updateUserProfile(
	userId: number,
	data: { name?: string; bio?: string | null; avatarUrl?: string | null }
) {
	const [updated] = await db
		.update(users)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning({
			id: users.id,
			name: users.name,
			bio: users.bio,
			avatarUrl: users.avatarUrl,
		});

	return updated;
}

export async function updateUserDefaultVisibility(
	userId: number,
	visibility: SubmissionVisibility
) {
	await db
		.update(users)
		.set({ defaultSubmissionVisibility: visibility, updatedAt: new Date() })
		.where(eq(users.id, userId));
	return { success: true };
}

export async function getUserDefaultVisibility(userId: number): Promise<SubmissionVisibility> {
	const [row] = await db
		.select({ visibility: users.defaultSubmissionVisibility })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row?.visibility ?? "public";
}
