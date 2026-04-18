"use client";

import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useRef } from "react";
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
	const editorRef = useRef<any>(null);
	const scrollAccumulator = useRef(0);
	const lastScrollTime = useRef(0);

	const handleEditorDidMount = (editor: any) => {
		editorRef.current = editor;
	};

	const handleWheelCapture = (e: React.WheelEvent<HTMLDivElement>) => {
		if (!editorRef.current) return;

		const now = Date.now();
		// Reset accumulator if scrolling paused
		if (now - lastScrollTime.current > 300) {
			scrollAccumulator.current = 0;
		}
		lastScrollTime.current = now;

		// Threshold before passing scroll to browser
		const LIMIT = 140;
		const editor = editorRef.current;
		const scrollTop = editor.getScrollTop();
		const scrollHeight = editor.getScrollHeight();
		const layoutInfo = editor.getLayoutInfo();
		const clientHeight = layoutInfo ? layoutInfo.height : 0;

		const isAtTop = scrollTop === 0;
		const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
		const isEditorEmpty = !code || code.trim() === "";

		let shouldPassToBrowser = isEditorEmpty;

		if (!isEditorEmpty) {
			// Calculate threshold if scrolling up at the top
			if (isAtTop && e.deltaY < 0) {
				scrollAccumulator.current += Math.abs(e.deltaY);
				if (scrollAccumulator.current > LIMIT) {
					shouldPassToBrowser = true;
				}
			}
			// Calculate threshold if scrolling down at the bottom
			else if (isAtBottom && e.deltaY > 0) {
				scrollAccumulator.current += Math.abs(e.deltaY);
				if (scrollAccumulator.current > LIMIT) {
					shouldPassToBrowser = true;
				}
			}
			// Reset if scrolling normally inside editor
			else {
				scrollAccumulator.current = 0;
			}
		}

		if (shouldPassToBrowser) {
			// Stop propagation in capture phase so Monaco editor won't block it via preventDefault
			// This allows the browser to natively scroll the window/container
			e.stopPropagation();
		}
	};

	return (
		<div className="border rounded-md overflow-hidden" onWheelCapture={handleWheelCapture}>
			<Editor
				height={height}
				language={language === "text" ? "plaintext" : language}
				value={code}
				onMount={handleEditorDidMount}
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
