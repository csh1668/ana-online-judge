import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";

const registerSchema = z.object({
	email: z.string().email("올바른 이메일 형식이 아닙니다."),
	password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
	name: z.string().min(2, "이름은 2자 이상이어야 합니다."),
});

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

		const { email, password, name } = validatedFields.data;

		// Check if user already exists
		const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

		if (existingUser.length > 0) {
			return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 400 });
		}

		// Hash password
		const hashedPassword = await hash(password, 12);

		// Create user
		const newUser = await db
			.insert(users)
			.values({
				email,
				password: hashedPassword,
				name,
			})
			.returning({ id: users.id, email: users.email, name: users.name });

		return NextResponse.json(
			{ message: "회원가입이 완료되었습니다.", user: newUser[0] },
			{ status: 201 }
		);
	} catch (error) {
		console.error("Registration error:", error);
		return NextResponse.json({ error: "회원가입 중 오류가 발생했습니다." }, { status: 500 });
	}
}
