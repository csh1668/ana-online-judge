"use client";

import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import type { Language } from "@/db/schema";

interface CodeEditorProps {
	code: string;
	language: Language;
	readOnly?: boolean;
	onChange?: (code: string) => void;
	height?: string;
}

export function CodeEditor({
	code,
	language,
	readOnly = false,
	onChange,
	height = "400px",
}: CodeEditorProps) {
	const { resolvedTheme } = useTheme();

	return (
		<div className="border rounded-md overflow-hidden">
			<Editor
				height={height}
				language={language}
				value={code}
				onChange={(value) => {
					if (!readOnly && onChange) {
						onChange(value || "");
					}
				}}
				theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
				options={{
					fontSize: 14,
					fontFamily: "var(--font-geist-mono), monospace",
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					padding: { top: 16, bottom: 16 },
					automaticLayout: true,
					readOnly,
					domReadOnly: readOnly,
				}}
			/>
		</div>
	);
}
