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
import { getLanguageList } from "@/lib/languages";
import { CodeEditor } from "./code-editor";

const LANGUAGE_STORAGE_KEY = "aoj.submit-language";

function readStoredLanguage(): string | null {
	try {
		return localStorage.getItem(LANGUAGE_STORAGE_KEY);
	} catch {
		return null;
	}
}

interface CodeSubmitProps {
	onSubmit: (code: string, language: Language) => Promise<void>;
	isSubmitting?: boolean;
	allowedLanguages?: string[] | null;
}

export function CodeSubmit({ onSubmit, isSubmitting = false, allowedLanguages }: CodeSubmitProps) {
	const languages = getLanguageList();
	// 허용된 언어 목록 필터링 (NULL이거나 빈 배열이면 모든 언어 허용)
	const availableLanguages =
		allowedLanguages && allowedLanguages.length > 0
			? languages.filter((lang) => allowedLanguages.includes(lang.value))
			: languages;

	// 첫 번째 허용된 언어를 기본값으로 설정
	const [language, setLanguage] = useState<Language>(availableLanguages[0]?.value || "cpp");
	const [code, setCode] = useState(availableLanguages[0]?.defaultCode || "");

	// 마운트 시 localStorage에 저장된 언어 복원 (허용된 언어 안에 있을 때만)
	// biome-ignore lint/correctness/useExhaustiveDependencies: 마운트 시 한 번만 복원
	useEffect(() => {
		const stored = readStoredLanguage();
		if (!stored) return;
		const langConfig = availableLanguages.find((l) => l.value === stored);
		if (langConfig && langConfig.value !== language) {
			setLanguage(langConfig.value);
			setCode(langConfig.defaultCode);
		}
	}, []);

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
		try {
			localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
		} catch {
			// ignore
		}
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
