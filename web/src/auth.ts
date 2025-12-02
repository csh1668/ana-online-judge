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
				email: { label: "이메일", type: "email" },
				password: { label: "비밀번호", type: "password" },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					return null;
				}

				const email = credentials.email as string;
				const password = credentials.password as string;

				const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

				if (user.length === 0) {
					return null;
				}

				const isValidPassword = await compare(password, user[0].password);

				if (!isValidPassword) {
					return null;
				}

				return {
					id: user[0].id.toString(),
					email: user[0].email,
					name: user[0].name,
					role: user[0].role,
				};
			},
		}),
	],
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.role = user.role;
			}
			return token;
		},
		async session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				session.user.role = token.role as string;
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
