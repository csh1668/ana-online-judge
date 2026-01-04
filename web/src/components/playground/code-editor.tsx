"use client";

import { Editor } from "@monaco-editor/react";
import { Play, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


interface CodeEditorProps {
	files: { path: string; content: string }[];
	activeFile: string;
	openTabs: string[];
	onTabClose: (path: string) => void;
	onTabSelect: (path: string) => void;
	onChange: (path: string, content: string) => void;
	onRun?: () => void;
	isRunning?: boolean;
	canRun?: boolean;
}

export function CodeEditor({
	files,
	activeFile,
	openTabs,
	onTabClose,
	onTabSelect,
	onChange,
	onRun,
	isRunning = false,
	canRun = false,
}: CodeEditorProps) {
	const { theme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const isBinaryExtension = (path: string): boolean => {
		const ext = path.split(".").pop()?.toLowerCase();
		const binaryExtensions = [
			"png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "svg",
			"mp3", "mp4", "avi", "mov", "wav", "flac", "ogg",
			"zip", "tar", "gz", "bz2", "7z", "rar",
			"exe", "dll", "so", "dylib", "bin",
			"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
		];
		return ext ? binaryExtensions.includes(ext) : false;
	};

	const activeFileData = files.find((f) => f.path === activeFile);
	let activeFileContent = "";
	let isBinaryFile = false;

	if (activeFileData) {
		if (isBinaryExtension(activeFileData.path)) {
			isBinaryFile = true;
			activeFileContent = "";
		} else {
			try {
				const binaryString = atob(activeFileData.content);
				activeFileContent = decodeURIComponent(escape(binaryString));
				const reencoded = btoa(unescape(encodeURIComponent(activeFileContent)));
				isBinaryFile = reencoded !== activeFileData.content;
			} catch {
				isBinaryFile = true;
				activeFileContent = "";
			}
		}
	}

	const getLanguage = (path: string) => {
		const ext = path.split(".").pop()?.toLowerCase();
		switch (ext) {
			case "js":
			case "jsx":
			case "ts":
			case "tsx":
				return "javascript";
			case "py":
				return "python";
			case "java":
				return "java";
			case "c":
			case "cpp":
			case "h":
			case "hpp":
				return "cpp";
			case "rs":
				return "rust";
			case "go":
				return "go";
			case "json":
				return "json";
			case "md":
				return "markdown";
			case "css":
				return "css";
			case "html":
				return "html";
			default:
				if (path.endsWith("Makefile") || path.endsWith("makefile")) return "makefile";
				return "plaintext";
		}
	};

	if (!mounted) return null;

	return (
		<div className="flex flex-col h-full bg-background border rounded-md overflow-hidden">
			<div className="flex overflow-x-auto border-b bg-muted/30 scrollbar-hide justify-between">
				<div className="flex overflow-x-auto scrollbar-hide">
					{openTabs.map((path) => {
						const isActive = path === activeFile;
						const filename = path.split("/").pop() || path;
						return (
							<div
								key={path}
								role="button"
								tabIndex={0}
								className={cn(
									"flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-r min-w-[120px] max-w-[200px]",
									isActive
										? "bg-background font-medium border-t-2 border-t-primary"
										: "bg-muted/50 text-muted-foreground hover:bg-muted/80"
								)}
								onClick={() => onTabSelect(path)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onTabSelect(path);
									}
								}}
							>
								<span className="truncate flex-1">{filename}</span>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onTabClose(path);
									}}
									className="p-0.5 rounded-sm hover:bg-muted-foreground/20 opacity-60 hover:opacity-100"
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						);
					})}
				</div>
				{onRun && (
					<div className="flex items-center px-2">
						<Button
							size="sm"
							onClick={onRun}
							disabled={isRunning || !canRun}
							className="min-w-[90px]"
						>
							{isRunning ? (
								<LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Play className="mr-2 h-4 w-4 fill-current" />
							)}
							{isRunning ? "실행 중" : "실행"}
						</Button>
					</div>
				)}
			</div>

			<div className="flex-1 relative">
				{activeFileData ? (
					isBinaryFile ? (
						<div className="flex items-center justify-center h-full text-muted-foreground">
							바이너리 파일은 편집할 수 없습니다.
						</div>
					) : (
						<Editor
							height="100%"
							language={getLanguage(activeFileData.path)}
							value={activeFileContent}
							theme={theme === "dark" ? "vs-dark" : "light"}
							onChange={(value) => {
								const encoded = btoa(unescape(encodeURIComponent(value || "")));
								onChange(activeFileData.path, encoded);
							}}
							options={{
								minimap: { enabled: false },
								fontSize: 14,
								lineNumbers: "on",
								scrollBeyondLastLine: false,
								automaticLayout: true,
								padding: { top: 10 },
							}}
						/>
					)
				) : (
					<div className="flex items-center justify-center h-full text-muted-foreground">
						파일을 선택하거나 생성해주세요
					</div>
				)}
			</div>
		</div>
	);
}

function LoaderIcon({ className }: { className?: string }) {
	return (
		<svg
			role="img"
			aria-label="Loading..."
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<title>Loading</title>
			<path d="M21 12a9 9 0 1 1-6.219-8.56" />
		</svg>
	);
}
