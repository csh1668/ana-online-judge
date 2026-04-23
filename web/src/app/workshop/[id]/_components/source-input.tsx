"use client";

import Editor from "@monaco-editor/react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type SourceInputMode = "file" | "inline";

export type TemplateOption = {
	id: string;
	label: string;
	description?: string;
};

type Props = {
	mode: SourceInputMode;
	onModeChange: (mode: SourceInputMode) => void;

	// File mode
	file: File | null;
	onFileChange: (file: File | null) => void;
	acceptExts?: string[]; // e.g. [".cpp", ".py"]

	// Inline mode
	inlineSource: string;
	onInlineSourceChange: (value: string) => void;
	monacoLanguage: string;

	// Optional template dropdown (shown only in inline mode)
	templates?: TemplateOption[];
	onTemplatePick?: (id: string) => void | Promise<void>;
	templatePending?: boolean;

	disabled?: boolean;
	heightClassName?: string; // default: "h-[40vh]"
};

export function SourceInput({
	mode,
	onModeChange,
	file,
	onFileChange,
	acceptExts,
	inlineSource,
	onInlineSourceChange,
	monacoLanguage,
	templates,
	onTemplatePick,
	templatePending,
	disabled,
	heightClassName = "h-[40vh]",
}: Props) {
	const fileRef = useRef<HTMLInputElement>(null);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label>소스</Label>
				<div className="flex gap-2">
					<Button
						type="button"
						size="sm"
						variant={mode === "file" ? "default" : "outline"}
						onClick={() => onModeChange("file")}
						disabled={disabled}
					>
						파일 업로드
					</Button>
					<Button
						type="button"
						size="sm"
						variant={mode === "inline" ? "default" : "outline"}
						onClick={() => onModeChange("inline")}
						disabled={disabled}
					>
						직접 입력
					</Button>
				</div>
			</div>

			{mode === "file" ? (
				<Input
					ref={fileRef}
					type="file"
					accept={acceptExts?.join(",")}
					onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
					disabled={disabled}
				/>
			) : (
				<div className="space-y-2">
					{templates && templates.length > 0 && onTemplatePick && (
						<div className="flex items-center gap-2">
							<Label className="text-xs">템플릿</Label>
							<Select
								value=""
								onValueChange={(v) => {
									void onTemplatePick(v);
								}}
								disabled={disabled || templatePending}
							>
								<SelectTrigger className="w-[260px]">
									<SelectValue placeholder="템플릿 삽입..." />
								</SelectTrigger>
								<SelectContent>
									{templates.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											<div className="flex flex-col">
												<span>{t.label}</span>
												{t.description && (
													<span className="text-xs text-muted-foreground">{t.description}</span>
												)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className={`${heightClassName} border rounded overflow-hidden`}>
						<Editor
							height="100%"
							value={inlineSource}
							onChange={(v) => onInlineSourceChange(v ?? "")}
							language={monacoLanguage}
							theme="vs-dark"
							options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
						/>
					</div>
				</div>
			)}

			{mode === "file" && file && (
				<p className="text-xs text-muted-foreground">
					선택됨: <span className="font-mono">{file.name}</span> ({file.size.toLocaleString()}{" "}
					바이트)
				</p>
			)}
		</div>
	);
}

/**
 * Shared Monaco-language resolver used by the workshop editors.
 * Kept here so every consumer agrees on the mapping.
 */
export function monacoLangFor(lang: string): string {
	switch (lang) {
		case "cpp":
		case "c":
			return "cpp";
		case "python":
			return "python";
		case "java":
			return "java";
		case "rust":
			return "rust";
		case "go":
			return "go";
		case "javascript":
			return "javascript";
		case "csharp":
			return "csharp";
		default:
			return "plaintext";
	}
}
