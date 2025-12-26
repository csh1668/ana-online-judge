import { hash } from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { siteSettings, users } from "@/db/schema";

const registerSchema = z.object({
	username: z
		.string()
		.min(3, "아이디는 3자 이상이어야 합니다.")
		.max(20, "아이디는 20자 이하여야 합니다.")
		.regex(/^[a-zA-Z0-9_]+$/, "아이디는 영문, 숫자, 밑줄(_)만 사용 가능합니다."),
	password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
	name: z.string().min(2, "이름은 2자 이상이어야 합니다."),
	email: z.string().email("올바른 이메일 형식이 아닙니다.").optional().or(z.literal("")),
});

// 회원가입 가능 여부 확인
async function isRegistrationOpen(): Promise<boolean> {
	const setting = await db
		.select()
		.from(siteSettings)
		.where(eq(siteSettings.key, "registration_open"))
		.limit(1);

	// 설정이 없으면 기본적으로 열려있음
	if (setting.length === 0) return true;

	return setting[0].value === "true";
}

// 첫 번째 사용자인지 확인
async function isFirstUser(): Promise<boolean> {
	const result = await db.select({ count: count() }).from(users);
	return result[0].count === 0;
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const validatedFields = registerSchema.safeParse(body);

		if (!validatedFields.success) {
			return NextResponse.json(
				{ error: validatedFields.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { username, password, name, email } = validatedFields.data;

		// 첫 사용자가 아니면 회원가입 가능 여부 확인
		const firstUser = await isFirstUser();
		if (!firstUser) {
			const registrationOpen = await isRegistrationOpen();
			if (!registrationOpen) {
				return NextResponse.json(
					{ error: "현재 회원가입이 비활성화되어 있습니다." },
					{ status: 403 }
				);
			}
		}

		// Check if username already exists
		const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1);

		if (existingUser.length > 0) {
			return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });
		}

		// Hash password
		const hashedPassword = await hash(password, 12);

		// 첫 번째 사용자는 자동으로 admin
		const role = firstUser ? "admin" : "user";

		// Create user
		const newUser = await db
			.insert(users)
			.values({
				username,
				password: hashedPassword,
				name,
				email: email || null,
				role,
			})
			.returning({ id: users.id, username: users.username, name: users.name, role: users.role });

		// 첫 사용자인 경우 registration_open 설정 생성
		if (firstUser) {
			await db
				.insert(siteSettings)
				.values({ key: "registration_open", value: "true" })
				.onConflictDoNothing();
		}

		return NextResponse.json(
			{
				message: firstUser
					? "회원가입이 완료되었습니다. 관리자 권한이 부여되었습니다."
					: "회원가입이 완료되었습니다.",
				user: newUser[0],
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error("Registration error:", error);
		return NextResponse.json({ error: "회원가입 중 오류가 발생했습니다." }, { status: 500 });
	}
}

// 회원가입 가능 여부 조회 API
export async function GET() {
	try {
		const firstUser = await isFirstUser();
		// 첫 사용자면 무조건 열려있음
		if (firstUser) {
			return NextResponse.json({ registrationOpen: true, isFirstUser: true });
		}

		const registrationOpen = await isRegistrationOpen();
		return NextResponse.json({ registrationOpen, isFirstUser: false });
	} catch (error) {
		console.error("Check registration status error:", error);
		return NextResponse.json({ error: "상태 확인 중 오류가 발생했습니다." }, { status: 500 });
	}
}
