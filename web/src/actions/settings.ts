"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import * as adminSettings from "@/lib/services/settings";

export async function getSiteSetting(...args: Parameters<typeof adminSettings.getSiteSetting>) {
	return adminSettings.getSiteSetting(...args);
}

export async function setSiteSetting(...args: Parameters<typeof adminSettings.setSiteSetting>) {
	await requireAdmin();
	const result = await adminSettings.setSiteSetting(...args);
	revalidatePath("/admin/settings");
	return result;
}

export async function toggleRegistration(
	...args: Parameters<typeof adminSettings.toggleRegistration>
) {
	await requireAdmin();
	const result = await adminSettings.toggleRegistration(...args);
	revalidatePath("/admin/settings");
	revalidatePath("/login");
	revalidatePath("/register");
	return result;
}

export async function getRegistrationStatus() {
	return adminSettings.getRegistrationStatus();
}

export async function toggleGoogleRegistration(
	...args: Parameters<typeof adminSettings.toggleGoogleRegistration>
) {
	await requireAdmin();
	const result = await adminSettings.toggleGoogleRegistration(...args);
	revalidatePath("/admin/settings");
	revalidatePath("/login");
	revalidatePath("/register");
	return result;
}

export async function getGoogleRegistrationStatus() {
	return adminSettings.getGoogleRegistrationStatus();
}

export type GetRegistrationStatusReturn = Awaited<ReturnType<typeof getRegistrationStatus>>;
export type ToggleRegistrationReturn = Awaited<ReturnType<typeof toggleRegistration>>;
