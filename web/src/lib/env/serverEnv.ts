import "server-only";

import { z } from "zod";

/**
 * Server-side environment variables
 * These are only available on the server and should never be exposed to the client
 *
 * Importing this file on the client will cause a build-time error
 */

const serverEnvSchema = z
	.object({
		// Database
		DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

		// Redis
		REDIS_URL: z.string().default("redis://localhost:6380"),

		// MinIO / S3
		MINIO_ENDPOINT: z.string().default("localhost"),
		MINIO_PORT: z.coerce.number().default(9000),
		MINIO_ACCESS_KEY: z.string().default("minioadmin"),
		MINIO_SECRET_KEY: z.string().default("minioadmin"),
		MINIO_BUCKET: z.string().default("aoj-storage"),
		MINIO_USE_SSL: z
			.string()
			.default("false")
			.transform((val) => val === "true" || val === "1"),

		// NextAuth
		NEXTAUTH_SECRET: z.string().optional(),
		NEXTAUTH_URL: z.string().url().optional(),

		// Google OAuth
		GOOGLE_CLIENT_ID: z.string().optional(),
		GOOGLE_CLIENT_SECRET: z.string().optional(),

		// Application
		NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	})
	.superRefine((data, ctx) => {
		// 빌드 타임에는 시크릿이 없으므로 런타임에서만 검증
		const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
		if (!isBuildPhase && data.NODE_ENV === "production" && !data.NEXTAUTH_SECRET) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["NEXTAUTH_SECRET"],
				message: "NEXTAUTH_SECRET is required in production",
			});
		}
	});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("❌ Invalid server environment variables:", parsed.error.flatten().fieldErrors);
	throw new Error("Invalid server environment variables");
}

export const serverEnv = parsed.data;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
