import "server-only";

import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface PublicUserListItem {
	username: string;
	name: string;
	rating: number;
	avatarUrl: string | null;
}

export interface PublicUserListResult {
	users: PublicUserListItem[];
	total: number;
	page: number;
	limit: number;
}

export async function listPublicUsers(input: {
	page?: number;
	limit?: number;
	search?: string;
	sort?: "rating" | "recent";
	order?: "asc" | "desc";
}): Promise<PublicUserListResult> {
	const page = input.page ?? 1;
	const limit = Math.min(input.limit ?? 20, 100);
	const offset = (page - 1) * limit;
	const sort = input.sort ?? "rating";
	const order = input.order ?? "desc";

	const conditions: SQL[] = [eq(users.isActive, true), isNull(users.contestId)];
	if (input.search) {
		const term = `%${input.search.trim()}%`;
		conditions.push(or(ilike(users.username, term), ilike(users.name, term))!);
	}
	const where = and(...conditions);

	let orderBy: SQL;
	switch (sort) {
		case "recent":
			orderBy = order === "asc" ? asc(users.createdAt) : desc(users.createdAt);
			break;
		default:
			orderBy = order === "asc" ? asc(users.rating) : desc(users.rating);
	}

	const [rows, totalRow] = await Promise.all([
		db
			.select({
				username: users.username,
				name: users.name,
				rating: users.rating,
				avatarUrl: users.avatarUrl,
			})
			.from(users)
			.where(where)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset),
		db.select({ count: count() }).from(users).where(where),
	]);

	return {
		users: rows.map((r) => ({
			username: r.username,
			name: r.name,
			rating: r.rating ?? 0,
			avatarUrl: r.avatarUrl ?? null,
		})),
		total: totalRow[0].count,
		page,
		limit,
	};
}

export interface PublicUserDetail {
	username: string;
	name: string;
	bio: string | null;
	avatarUrl: string | null;
	rating: number;
	joinedAt: string;
}

export async function getPublicUserByUsername(username: string): Promise<PublicUserDetail | null> {
	const [row] = await db
		.select({
			username: users.username,
			name: users.name,
			bio: users.bio,
			avatarUrl: users.avatarUrl,
			rating: users.rating,
			createdAt: users.createdAt,
			isActive: users.isActive,
			contestId: users.contestId,
		})
		.from(users)
		.where(eq(users.username, username))
		.limit(1);

	if (!row?.isActive || row.contestId !== null) return null;

	return {
		username: row.username,
		name: row.name,
		bio: row.bio ?? null,
		avatarUrl: row.avatarUrl ?? null,
		rating: row.rating ?? 0,
		joinedAt: row.createdAt.toISOString(),
	};
}
