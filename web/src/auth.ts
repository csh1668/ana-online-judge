import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";

export const { handlers, signIn, signOut, auth } = NextAuth({
	providers: [
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
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.role = user.role;
				token.contestAccountOnly = user.contestAccountOnly;
				token.contestId = user.contestId;
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
