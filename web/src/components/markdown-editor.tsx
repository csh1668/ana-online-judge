"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { ImagePlus, Loader2 } from "lucide-react";
import type * as monaco from "monaco-editor";
import { useCallback, useRef, useState } from "react";
import { uploadProblemImage } from "@/actions/upload";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	problemId?: number;
	disabled?: boolean;
	className?: string;
	minHeight?: string;
}

export function MarkdownEditor({
	value,
	onChange,
	problemId,
	disabled = false,
	className,
	minHeight = "500px",
}: MarkdownEditorProps) {
	const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
	const [isUploading, setIsUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const handleEditorMount: OnMount = (editor) => {
		editorRef.current = editor;
	};

	const insertImageMarkdown = useCallback(
		(url: string, altText: string = "image") => {
			const editor = editorRef.current;
			if (!editor) {
				// Fallback: append to value
				onChange(`${value}\n![${altText}](${url})`);
				return;
			}

			const selection = editor.getSelection();
			const position = selection
				? { lineNumber: selection.startLineNumber, column: selection.startColumn }
				: editor.getPosition();

			if (position) {
				const markdown = `![${altText}](${url})`;
				editor.executeEdits("", [
					{
						range: {
							startLineNumber: position.lineNumber,
							startColumn: position.column,
							endLineNumber: position.lineNumber,
							endColumn: position.column,
						},
						text: markdown,
					},
				]);
				editor.focus();
			}
		},
		[value, onChange]
	);

	const uploadImage = useCallback(
		async (file: File) => {
			setIsUploading(true);
			setUploadError(null);

			try {
				const formData = new FormData();
				formData.append("file", file);

				const result = await uploadProblemImage(formData, problemId);

				if (result.success && result.url) {
					insertImageMarkdown(result.url, file.name.replace(/\.[^/.]+$/, ""));
				} else {
					setUploadError(result.error || "업로드에 실패했습니다.");
				}
			} catch {
				setUploadError("업로드 중 오류가 발생했습니다.");
			} finally {
				setIsUploading(false);
			}
		},
		[problemId, insertImageMarkdown]
	);

	// Handle file input change
	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				uploadImage(file);
			}
			// Reset input
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[uploadImage]
	);

	// Handle paste event
	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) return;

			for (const item of items) {
				if (item.type.startsWith("image/")) {
					e.preventDefault();
					const file = item.getAsFile();
					if (file) {
						uploadImage(file);
					}
					return;
				}
			}
		},
		[uploadImage]
	);

	// Handle drag and drop
	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const files = e.dataTransfer?.files;
			if (!files?.length) return;

			const file = files[0];
			if (file.type.startsWith("image/")) {
				uploadImage(file);
			}
		},
		[uploadImage]
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	return (
		<div className={cn("border rounded-lg overflow-hidden", className)}>
			<Tabs
				value={activeTab}
				onValueChange={(v) => setActiveTab(v as "edit" | "preview")}
				className="flex flex-col"
			>
				<div className="flex items-center justify-between border-b bg-muted/30 px-2 py-1">
					<TabsList>
						<TabsTrigger value="edit">편집</TabsTrigger>
						<TabsTrigger value="preview">미리보기</TabsTrigger>
					</TabsList>

					{activeTab === "edit" && (
						<div className="flex items-center gap-2">
							{uploadError && <span className="text-xs text-destructive">{uploadError}</span>}
							{isUploading && (
								<span className="text-xs text-muted-foreground flex items-center gap-1">
									<Loader2 className="h-3 w-3 animate-spin" />
									업로드 중...
								</span>
							)}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => fileInputRef.current?.click()}
								disabled={disabled || isUploading}
							>
								<ImagePlus className="h-4 w-4 mr-1" />
								이미지
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/jpeg,image/png,image/gif,image/webp"
								className="hidden"
								onChange={handleFileSelect}
							/>
						</div>
					)}
				</div>

				<TabsContent value="edit" className="m-0">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Editor container needs drag/drop and paste support for image upload */}
					<div
						ref={containerRef}
						onPaste={handlePaste}
						onDrop={handleDrop}
						onDragOver={handleDragOver}
						style={{ minHeight }}
					>
						<Editor
							height={minHeight}
							defaultLanguage="markdown"
							value={value}
							onChange={(v) => onChange(v || "")}
							onMount={handleEditorMount}
							theme="vs-dark"
							options={{
								minimap: { enabled: false },
								lineNumbers: "on",
								wordWrap: "on",
								fontSize: 14,
								tabSize: 2,
								scrollBeyondLastLine: false,
								automaticLayout: true,
								readOnly: disabled,
								padding: { top: 16, bottom: 16 },
							}}
							loading={
								<div className="flex items-center justify-center h-full text-muted-foreground">
									<Loader2 className="h-6 w-6 animate-spin mr-2" />
									에디터 로딩 중...
								</div>
							}
						/>
					</div>
				</TabsContent>

				<TabsContent value="preview" className="m-0">
					<div
						className="px-6 overflow-auto bg-background"
						style={{ minHeight, maxHeight: "70vh" }}
					>
						{value ? (
							<MarkdownRenderer content={value} />
						) : (
							<p className="text-muted-foreground text-center py-8">미리볼 내용이 없습니다.</p>
						)}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
