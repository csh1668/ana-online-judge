"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LanguageCode, Translations } from "@/db/schema";
import { LANGUAGE_DISPLAY_NAMES, nowIso } from "@/lib/utils/translations";

interface Props {
	value: Translations;
	onChange: (next: Translations) => void;
	onPromoteOriginal?: (lang: LanguageCode) => void;
	onDeleteLanguage?: (lang: LanguageCode) => void;
}

const ALL_LANGUAGES: LanguageCode[] = ["ko", "en", "ja", "pl", "hr"];

export function TranslationTabs({ value, onChange, onPromoteOriginal, onDeleteLanguage }: Props) {
	const available = Object.keys(value.entries) as LanguageCode[];
	const [activeTab, setActiveTab] = useState<LanguageCode>(available[0]);
	const addable = ALL_LANGUAGES.filter((l) => !available.includes(l));

	function updateEntry(lang: LanguageCode, patch: { title?: string; content?: string }) {
		const entry = value.entries[lang];
		if (!entry) return;
		onChange({
			...value,
			entries: {
				...value.entries,
				[lang]: { ...entry, ...patch, updatedAt: nowIso() },
			},
		});
	}

	function addLanguage(lang: LanguageCode) {
		const now = nowIso();
		onChange({
			...value,
			entries: {
				...value.entries,
				[lang]: { title: "", content: "", createdAt: now, updatedAt: now },
			},
		});
		setActiveTab(lang);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LanguageCode)}>
					<TabsList>
						{available.map((lang) => (
							<TabsTrigger key={lang} value={lang}>
								{LANGUAGE_DISPLAY_NAMES[lang]}
								{value.original === lang && (
									<span className="ml-2 rounded bg-primary/10 px-1 text-primary text-xs">원문</span>
								)}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{addable.length > 0 && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm">
								+ 언어 추가
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							{addable.map((lang) => (
								<DropdownMenuItem key={lang} onClick={() => addLanguage(lang)}>
									{LANGUAGE_DISPLAY_NAMES[lang]}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			<Tabs value={activeTab}>
				{available.map((lang) => {
					const entry = value.entries[lang];
					if (!entry) return null;
					const isOriginal = value.original === lang;
					return (
						<TabsContent key={lang} value={lang} className="space-y-3">
							<div>
								<Label>제목</Label>
								<Input
									value={entry.title}
									onChange={(e) => updateEntry(lang, { title: e.target.value })}
								/>
							</div>
							<div>
								<Label>본문 (Markdown)</Label>
								<Textarea
									value={entry.content}
									onChange={(e) => updateEntry(lang, { content: e.target.value })}
									className="min-h-[300px] font-mono"
								/>
							</div>
							<div className="flex gap-2">
								{!isOriginal && onPromoteOriginal && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onPromoteOriginal(lang)}
									>
										원문으로 지정
									</Button>
								)}
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={isOriginal}
									title={
										isOriginal ? "원문은 다른 언어를 먼저 원문으로 지정해야 삭제 가능" : undefined
									}
									onClick={() => onDeleteLanguage?.(lang)}
								>
									이 번역 삭제
								</Button>
							</div>
						</TabsContent>
					);
				})}
			</Tabs>
		</div>
	);
}
