"use client";

import { Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Language } from "@/db/schema";
import { LANGUAGES } from "@/lib/languages";
import { CodeEditor } from "./code-editor";

interface CodeSubmitProps {
	onSubmit: (code: string, language: Language) => Promise<void>;
	isSubmitting?: boolean;
	allowedLanguages?: string[] | null;
}

export function CodeSubmit({ onSubmit, isSubmitting = false, allowedLanguages }: CodeSubmitProps) {
	// 허용된 언어 목록 필터링 (NULL이거나 빈 배열이면 모든 언어 허용)
	const availableLanguages =
		allowedLanguages && allowedLanguages.length > 0
			? LANGUAGES.filter((lang) => allowedLanguages.includes(lang.value))
			: LANGUAGES;

	// 첫 번째 허용된 언어를 기본값으로 설정
	const [language, setLanguage] = useState<Language>(availableLanguages[0]?.value || "cpp");
	const [code, setCode] = useState(availableLanguages[0]?.defaultCode || "");

	// allowedLanguages가 변경되면 언어 재설정
	useEffect(() => {
		if (availableLanguages.length > 0 && !availableLanguages.find((l) => l.value === language)) {
			const newLang = availableLanguages[0];
			setLanguage(newLang.value);
			setCode(newLang.defaultCode);
		}
	}, [availableLanguages, language]);

	const handleLanguageChange = (value: string) => {
		const newLanguage = value as Language;
		setLanguage(newLanguage);
		const langConfig = availableLanguages.find((l) => l.value === newLanguage);
		if (langConfig) {
			setCode(langConfig.defaultCode);
		}
	};

	const handleSubmit = async () => {
		await onSubmit(code, language);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<Select value={language} onValueChange={handleLanguageChange}>
					<SelectTrigger className="w-[150px]">
						<SelectValue placeholder="언어 선택" />
					</SelectTrigger>
					<SelectContent>
						{availableLanguages.map((lang) => (
							<SelectItem key={lang.value} value={lang.value}>
								{lang.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button onClick={handleSubmit} disabled={isSubmitting || !code.trim()}>
					{isSubmitting ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							제출 중...
						</>
					) : (
						<>
							<Play className="mr-2 h-4 w-4" />
							제출
						</>
					)}
				</Button>
			</div>
			<CodeEditor code={code} language={language} onChange={setCode} />
		</div>
	);
}
