import { z } from "zod";

/**
 * Public environment variables (available on both client and server)
 * These must be prefixed with NEXT_PUBLIC_ to be exposed to the browser
 */

const publicEnvSchema = z.object({
	NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_BUILD_TIME: z.iso.datetime(),
	NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
});

const parsed = publicEnvSchema.safeParse({
	NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
	NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
	NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
});

if (!parsed.success) {
	console.error("❌ Invalid public environment variables:", parsed.error.flatten().fieldErrors);
	throw new Error("Invalid public environment variables");
}

export const publicEnv = parsed.data;

export type PublicEnv = z.infer<typeof publicEnvSchema>;
