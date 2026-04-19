"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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

// "예제 입력 N" 패턴에서 가장 큰 N을 찾는다. 매치가 없으면 0.
function findLastExampleNumber(content: string): number {
	let max = 0;
	for (const match of content.matchAll(/예제 입력 (\d+)/g)) {
		const n = parseInt(match[1], 10);
		if (!Number.isNaN(n) && n > max) max = n;
	}
	return max;
}

function buildExampleBlock(n: number, input: string, output: string): string {
	// 붙여넣은 값 양끝 개행 다듬고 펜스로 감쌈
	const trimmedInput = input.replace(/^\n+|\n+$/g, "");
	const trimmedOutput = output.replace(/^\n+|\n+$/g, "");
	return [
		`예제 입력 ${n}`,
		"```",
		trimmedInput,
		"```",
		"",
		`예제 출력 ${n}`,
		"```",
		trimmedOutput,
		"```",
	].join("\n");
}

function appendExample(content: string, block: string): string {
	const trimmed = content.replace(/\s+$/, "");
	if (trimmed.length === 0) return `${block}\n`;
	return `${trimmed}\n\n${block}\n`;
}

function AddExampleDialog({
	currentContent,
	onAppend,
}: {
	currentContent: string;
	onAppend: (nextContent: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");

	const nextNumber = findLastExampleNumber(currentContent) + 1;

	function reset() {
		setInput("");
		setOutput("");
	}

	function handleSubmit() {
		if (!input.trim() || !output.trim()) return;
		const block = buildExampleBlock(nextNumber, input, output);
		onAppend(appendExample(currentContent, block));
		reset();
		setOpen(false);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" variant="secondary" size="sm">
					+ 테스트케이스 추가 (예제 {nextNumber})
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>예제 {nextNumber} 추가</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label>입력</Label>
						<Textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="예제 입력 내용을 붙여넣으세요"
							className="min-h-[140px] font-mono"
						/>
					</div>
					<div>
						<Label>출력</Label>
						<Textarea
							value={output}
							onChange={(e) => setOutput(e.target.value)}
							placeholder="예제 출력 내용을 붙여넣으세요"
							className="min-h-[140px] font-mono"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => setOpen(false)}>
						취소
					</Button>
					<Button type="button" onClick={handleSubmit} disabled={!input.trim() || !output.trim()}>
						본문 끝에 추가
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

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
								<div className="flex items-center justify-between">
									<Label>본문 (Markdown)</Label>
									<AddExampleDialog
										currentContent={entry.content}
										onAppend={(nextContent) => updateEntry(lang, { content: nextContent })}
									/>
								</div>
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
