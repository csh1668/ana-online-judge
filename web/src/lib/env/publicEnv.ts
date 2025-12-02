import { z } from "zod";

/**
 * Public environment variables (available on both client and server)
 * These must be prefixed with NEXT_PUBLIC_ to be exposed to the browser
 */

const publicEnvSchema = z.object({
	NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

const parsed = publicEnvSchema.safeParse({
	NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!parsed.success) {
	console.error("❌ Invalid public environment variables:", parsed.error.flatten().fieldErrors);
	throw new Error("Invalid public environment variables");
}

export const publicEnv = parsed.data;

export type PublicEnv = z.infer<typeof publicEnvSchema>;
