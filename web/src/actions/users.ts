"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-utils";

interface CsvUserRow {
	username: string;
	name: string;
	password: string;
	email?: string;
}

interface CsvResult {
	created: number;
	errors: { row: number; username: string; error: string }[];
}

function parseCsv(csvText: string): CsvUserRow[] {
	const lines = csvText.trim().split("\n");
	if (lines.length < 2) return [];

	// 헤더 파싱
	const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
	const usernameIdx = headers.indexOf("username");
	const nameIdx = headers.indexOf("name");
	const passwordIdx = headers.indexOf("password");
	const emailIdx = headers.indexOf("email");

	if (usernameIdx === -1 || nameIdx === -1 || passwordIdx === -1) {
		throw new Error("CSV 헤더에 username, name, password 필드가 필요합니다.");
	}

	const rows: CsvUserRow[] = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const values = line.split(",").map((v) => v.trim());
		rows.push({
			username: values[usernameIdx] || "",
			name: values[nameIdx] || "",
			password: values[passwordIdx] || "",
			email: emailIdx !== -1 ? values[emailIdx] || undefined : undefined,
		});
	}

	return rows;
}

function validateUsername(username: string): string | null {
	if (!username || username.length < 3) return "아이디는 3자 이상이어야 합니다.";
	if (username.length > 20) return "아이디는 20자 이하여야 합니다.";
	if (!/^[a-zA-Z0-9_]+$/.test(username)) return "아이디는 영문, 숫자, 밑줄만 사용 가능합니다.";
	return null;
}

function validatePassword(password: string): string | null {
	if (!password || password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
	return null;
}

function validateName(name: string): string | null {
	if (!name || name.length < 2) return "이름은 2자 이상이어야 합니다.";
	return null;
}

function validateEmail(email: string | undefined): string | null {
	if (!email) return null; // 이메일은 선택사항
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) return "올바른 이메일 형식이 아닙니다.";
	return null;
}

export async function createUsersFromCsv(csvText: string): Promise<CsvResult> {
	await requireAdmin();

	const result: CsvResult = {
		created: 0,
		errors: [],
	};

	let rows: CsvUserRow[];
	try {
		rows = parseCsv(csvText);
	} catch (error) {
		if (error instanceof Error) {
			result.errors.push({ row: 0, username: "", error: error.message });
		}
		return result;
	}

	if (rows.length === 0) {
		result.errors.push({ row: 0, username: "", error: "CSV에 데이터가 없습니다." });
		return result;
	}

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2; // 1-indexed + header row

		// 유효성 검사
		const usernameError = validateUsername(row.username);
		if (usernameError) {
			result.errors.push({ row: rowNum, username: row.username, error: usernameError });
			continue;
		}

		const passwordError = validatePassword(row.password);
		if (passwordError) {
			result.errors.push({ row: rowNum, username: row.username, error: passwordError });
			continue;
		}

		const nameError = validateName(row.name);
		if (nameError) {
			result.errors.push({ row: rowNum, username: row.username, error: nameError });
			continue;
		}

		const emailError = validateEmail(row.email);
		if (emailError) {
			result.errors.push({ row: rowNum, username: row.username, error: emailError });
			continue;
		}

		// 중복 체크
		const existing = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, row.username))
			.limit(1);

		if (existing.length > 0) {
			result.errors.push({
				row: rowNum,
				username: row.username,
				error: "이미 존재하는 아이디입니다.",
			});
			continue;
		}

		// 사용자 생성
		try {
			const hashedPassword = await hash(row.password, 12);
			await db.insert(users).values({
				username: row.username,
				name: row.name,
				password: hashedPassword,
				email: row.email || null,
			});
			result.created++;
		} catch {
			result.errors.push({ row: rowNum, username: row.username, error: "계정 생성 중 오류 발생" });
		}
	}

	revalidatePath("/admin/users");
	revalidatePath("/admin/settings");

	return result;
}

export type CreateUsersFromCsvReturn = Awaited<ReturnType<typeof createUsersFromCsv>>;
