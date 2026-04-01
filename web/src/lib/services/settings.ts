import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { GOOGLE_REGISTRATION_OPEN_KEY, REGISTRATION_OPEN_KEY } from "@/lib/auth-utils";

export async function getSiteSetting(key: string): Promise<string | null> {
	const setting = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
	return setting.length > 0 ? setting[0].value : null;
}

export async function setSiteSetting(key: string, value: string) {
	await db
		.insert(siteSettings)
		.values({ key, value })
		.onConflictDoUpdate({
			target: siteSettings.key,
			set: { value, updatedAt: new Date() },
		});

	return { success: true };
}

export async function toggleRegistration(enabled: boolean) {
	await db
		.insert(siteSettings)
		.values({ key: REGISTRATION_OPEN_KEY, value: enabled ? "true" : "false" })
		.onConflictDoUpdate({
			target: siteSettings.key,
			set: { value: enabled ? "true" : "false", updatedAt: new Date() },
		});

	return { success: true, enabled };
}

export async function getRegistrationStatus(): Promise<boolean> {
	const setting = await getSiteSetting(REGISTRATION_OPEN_KEY);
	return setting === null || setting === "true";
}

export async function toggleGoogleRegistration(enabled: boolean) {
	await db
		.insert(siteSettings)
		.values({ key: GOOGLE_REGISTRATION_OPEN_KEY, value: enabled ? "true" : "false" })
		.onConflictDoUpdate({
			target: siteSettings.key,
			set: { value: enabled ? "true" : "false", updatedAt: new Date() },
		});

	return { success: true, enabled };
}

export async function getGoogleRegistrationStatus(): Promise<boolean> {
	const setting = await getSiteSetting(GOOGLE_REGISTRATION_OPEN_KEY);
	return setting === null || setting === "true";
}
