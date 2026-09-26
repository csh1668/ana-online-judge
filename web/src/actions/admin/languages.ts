"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireAdmin } from "@/lib/auth-utils";
import * as svc from "@/lib/services/languages";

function revalidate() {
	revalidatePath("/admin/languages");
	revalidatePath("/judge-info");
}

export async function listLanguagesAction(opts?: { includeDeleted?: boolean }) {
	await requireAdmin();
	await svc.reconcileInstallingLanguages();
	return svc.listLanguages(opts);
}

export async function getLanguageAction(id: string) {
	await requireAdmin();
	return svc.getLanguage(id);
}

export async function getAdminLanguageOptions() {
	await requireAdmin();
	return (await svc.listLanguages()).map((r) => ({ value: r.id, label: r.label }));
}

export async function createLanguageAction(input: svc.LanguageInput) {
	await requireAdmin();
	const row = await svc.createLanguage(input);
	revalidate();
	return row;
}

export async function updateLanguageAction(
	id: string,
	input: z.infer<typeof svc.languageUpdateSchema>
) {
	await requireAdmin();
	const row = await svc.updateLanguage(id, input);
	revalidate();
	return row;
}

export async function deleteLanguageAction(id: string) {
	await requireAdmin();
	await svc.softDeleteLanguage(id);
	revalidate();
}

export async function restoreLanguageAction(id: string) {
	await requireAdmin();
	await svc.restoreLanguage(id);
	revalidate();
}

export async function installLanguageAction(id: string) {
	await requireAdmin();
	const r = await svc.requestInstall(id);
	revalidate();
	return r;
}

export async function uninstallLanguageAction(id: string) {
	await requireAdmin();
	await svc.requestUninstall(id);
	revalidate();
}

export async function resetLanguageInstallStateAction(id: string) {
	await requireAdmin();
	await svc.resetInstallState(id);
	revalidate();
}
