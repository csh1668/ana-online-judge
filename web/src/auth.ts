import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isGoogleRegistrationOpen } from "@/lib/auth-utils";
import { serverEnv } from "@/lib/env";

export const { handlers, signIn, signOut, auth } = NextAuth({
	providers: [
		Google({
			clientId: serverEnv.GOOGLE_CLIENT_ID,
			clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
		}),
		Credentials({
			name: "credentials",
			credentials: {
				username: { label: "아이디", type: "text" },
				password: { label: "비밀번호", type: "password" },
			},
			async authorize(credentials) {
				if (!credentials?.username || !credentials?.password) {
					return null;
				}

				const username = credentials.username as string;
				const password = credentials.password as string;

				const user = await db.select().from(users).where(eq(users.username, username)).limit(1);

				if (user.length === 0) {
					return null;
				}

				// Check if account is active
				if (!user[0].isActive) {
					return null;
				}

				// OAuth users don't have passwords
				if (!user[0].password) {
					return null;
				}

				const isValidPassword = await compare(password, user[0].password);

				if (!isValidPassword) {
					return null;
				}

				return {
					id: user[0].id.toString(),
					email: user[0].email ?? undefined,
					name: user[0].name,
					role: user[0].role,
					contestAccountOnly: user[0].contestAccountOnly ?? undefined,
					contestId: user[0].contestId ?? undefined,
				};
			},
		}),
	],
	callbacks: {
		async signIn({ user, account }) {
			// Google OAuth 로그인 처리
			if (account?.provider === "google") {
				const googleId = account.providerAccountId;
				const email = user.email;
				const name = user.name || "Google User";

				// authId로 기존 사용자 찾기
				const existingUser = await db
					.select()
					.from(users)
					.where(eq(users.authId, googleId))
					.limit(1);

				// 기존 사용자가 있으면 로그인 허용 (회원가입 설정 체크 안 함)
				if (existingUser.length > 0) {
					return true;
				}

				// 신규 사용자인 경우: 구글 회원가입이 열려있는지 확인
				const googleRegistrationOpen = await isGoogleRegistrationOpen();
				if (!googleRegistrationOpen) {
					return false;
				}

				// 이메일 중복 체크 (이메일이 있는 경우)
				if (email) {
					const existingEmail = await db
						.select()
						.from(users)
						.where(eq(users.email, email))
						.limit(1);

					if (existingEmail.length > 0) {
						// 이미 해당 이메일로 가입된 계정이 있음
						console.error(`Email ${email} is already registered`);
						return false;
					}
				}

				// 신규 사용자 생성
				const username = `google_${googleId}`;

				// username 중복 체크 (만약을 위해)
				const usernameExists = await db
					.select()
					.from(users)
					.where(eq(users.username, username))
					.limit(1);

				if (usernameExists.length > 0) {
					// 매우 드문 경우지만, 타임스탬프 추가
					const timestamp = Date.now();
					await db.insert(users).values({
						username: `google_${googleId}_${timestamp}`,
						email: email || null,
						password: null,
						name,
						role: "user",
						authId: googleId,
						authProvider: "google",
					});
				} else {
					await db.insert(users).values({
						username,
						email: email || null,
						password: null,
						name,
						role: "user",
						authId: googleId,
						authProvider: "google",
					});
				}
			}

			return true;
		},
		async jwt({ token, user, account }) {
			if (user) {
				// Credentials 로그인 또는 초기 OAuth 로그인
				if (account?.provider === "google") {
					// Google 로그인: DB에서 사용자 정보 가져오기
					const googleId = account.providerAccountId;
					const dbUser = await db.select().from(users).where(eq(users.authId, googleId)).limit(1);

					if (dbUser.length > 0) {
						token.id = dbUser[0].id.toString();
						token.role = dbUser[0].role;
						token.contestAccountOnly = dbUser[0].contestAccountOnly;
						token.contestId = dbUser[0].contestId;
					}
				} else {
					// Credentials 로그인
					token.id = user.id;
					token.role = user.role;
					token.contestAccountOnly = user.contestAccountOnly;
					token.contestId = user.contestId;
				}
			}
			return token;
		},
		async session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				session.user.role = token.role as string;
				session.user.contestAccountOnly = token.contestAccountOnly as boolean;
				session.user.contestId = token.contestId as number | null;
			}
			return session;
		},
	},
	pages: {
		signIn: "/login",
	},
	session: {
		strategy: "jwt",
	},
});
