import type { LanguageCode, Translation, Translations } from "@/db/schema";

export const LANGUAGE_DISPLAY_NAMES: Record<LanguageCode, string> = {
	ko: "한국어",
	en: "English",
	ja: "日本語",
	pl: "Polski",
	hr: "Hrvatski",
};

export function resolveDisplay(t: Translations, locale: LanguageCode = "ko"): Translation {
	const preferred = t.entries[locale];
	if (preferred) return preferred;
	const original = t.entries[t.original];
	if (!original) {
		throw new Error(
			`Invariant violation: original translation (${t.original}) missing from entries`
		);
	}
	return original;
}

export function listAvailableLanguages(t: Translations): LanguageCode[] {
	return Object.keys(t.entries) as LanguageCode[];
}

export function isOriginalLanguage(t: Translations, language: LanguageCode): boolean {
	return t.original === language;
}

export function nowIso(): string {
	return new Date().toISOString();
}
