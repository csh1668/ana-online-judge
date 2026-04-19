"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { LanguageCode, Translations } from "@/db/schema";
import { LANGUAGE_DISPLAY_NAMES, listAvailableLanguages } from "@/lib/utils/translations";

interface Props {
	translations: Translations;
	currentLanguage: LanguageCode;
	onChange: (lang: LanguageCode) => void;
}

export function LanguageSwitcher({ translations, currentLanguage, onChange }: Props) {
	const available = listAvailableLanguages(translations);
	if (available.length <= 1) return null;

	return (
		<div className="flex items-center gap-2 text-sm">
			<Select value={currentLanguage} onValueChange={(v) => onChange(v as LanguageCode)}>
				<SelectTrigger className="h-8 w-32">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{available.map((lang) => (
						<SelectItem key={lang} value={lang}>
							{LANGUAGE_DISPLAY_NAMES[lang]}
							{translations.original === lang ? " (원문)" : ""}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{translations.original !== currentLanguage && (
				<span className="text-muted-foreground text-xs">
					원문: {LANGUAGE_DISPLAY_NAMES[translations.original]}
				</span>
			)}
		</div>
	);
}
