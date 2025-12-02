import "server-only";

import { z } from "zod";

/**
 * Server-side environment variables
 * These are only available on the server and should never be exposed to the client
 *
 * Importing this file on the client will cause a build-time error
 */

const serverEnvSchema = z.object({
	// Database
	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

	// Redis
	REDIS_URL: z.string().default("redis://localhost:6379"),

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

	// Application
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("❌ Invalid server environment variables:", parsed.error.flatten().fieldErrors);
	throw new Error("Invalid server environment variables");
}

export const serverEnv = parsed.data;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
