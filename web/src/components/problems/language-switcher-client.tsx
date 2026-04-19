"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LanguageCode, Translations } from "@/db/schema";
import { LanguageSwitcher } from "./language-switcher";

interface Props {
	translations: Translations;
	currentLanguage: LanguageCode;
}

export function LanguageSwitcherClient({ translations, currentLanguage }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	return (
		<LanguageSwitcher
			translations={translations}
			currentLanguage={currentLanguage}
			onChange={(lang) => {
				const qs = new URLSearchParams(params.toString());
				qs.set("locale", lang);
				router.push(`${pathname}?${qs.toString()}`);
			}}
		/>
	);
}
