"use client";

import Editor from "@monaco-editor/react";
import { Loader2, Play } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const LANGUAGES = [
	{
		value: "cpp",
		label: "C++",
		defaultCode:
			"#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}",
	},
	{
		value: "c",
		label: "C",
		defaultCode: "#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}",
	},
	{ value: "python", label: "Python", defaultCode: "# Python 3\n\n" },
	{
		value: "java",
		label: "Java",
		defaultCode:
			"import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}",
	},
];

const LANGUAGE_MAP: Record<string, string> = {
	cpp: "cpp",
	c: "c",
	python: "python",
	java: "java",
};

interface CodeEditorProps {
	onSubmit: (code: string, language: string) => Promise<void>;
	isSubmitting?: boolean;
}

export function CodeEditor({ onSubmit, isSubmitting = false }: CodeEditorProps) {
	const { resolvedTheme } = useTheme();
	const [language, setLanguage] = useState("cpp");
	const [code, setCode] = useState(LANGUAGES[0].defaultCode);

	const handleLanguageChange = (value: string) => {
		setLanguage(value);
		const langConfig = LANGUAGES.find((l) => l.value === value);
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
						{LANGUAGES.map((lang) => (
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
			<div className="border rounded-md overflow-hidden">
				<Editor
					height="400px"
					language={LANGUAGE_MAP[language]}
					value={code}
					onChange={(value) => setCode(value || "")}
					theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
					options={{
						fontSize: 14,
						fontFamily: "var(--font-geist-mono), monospace",
						minimap: { enabled: false },
						scrollBeyondLastLine: false,
						padding: { top: 16, bottom: 16 },
						automaticLayout: true,
					}}
				/>
			</div>
		</div>
	);
}
