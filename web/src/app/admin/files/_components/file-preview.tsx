"use client";

import { Download, Edit, FileQuestion, Loader2, Save, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getFileContent, getFilePreview, updateFileContent } from "@/actions/file-manager";
import { Button } from "@/components/ui/button";
import type { FilePreview as FilePreviewData } from "@/lib/services/file-manager";

const Editor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.default), {
	ssr: false,
	loading: () => (
		<div className="flex h-full items-center justify-center">
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</div>
	),
});

interface FilePreviewProps {
	fileKey: string | null;
	onDelete: (key: string) => void;
	onDeleted: () => void;
}

const EXT_LANG_MAP: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	ts: "typescript",
	tsx: "typescript",
	py: "python",
	c: "c",
	h: "c",
	cpp: "cpp",
	cxx: "cpp",
	cc: "cpp",
	hpp: "cpp",
	java: "java",
	rs: "rust",
	go: "go",
	json: "json",
	md: "markdown",
	html: "html",
	htm: "html",
	css: "css",
	scss: "scss",
	yaml: "yaml",
	yml: "yaml",
	sh: "shell",
	bash: "shell",
	zsh: "shell",
	toml: "ini",
	xml: "xml",
	sql: "sql",
	dockerfile: "dockerfile",
	makefile: "makefile",
	txt: "plaintext",
};

function getMonacoLanguage(filename: string): string {
	const lower = filename.toLowerCase();
	if (lower === "dockerfile") return "dockerfile";
	if (lower === "makefile") return "makefile";
	const ext = lower.split(".").pop() ?? "";
	return EXT_LANG_MAP[ext] ?? "plaintext";
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreview({ fileKey, onDelete, onDeleted }: FilePreviewProps) {
	const [preview, setPreview] = useState<FilePreviewData | null>(null);
	const [loading, setLoading] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editContent, setEditContent] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!fileKey) {
			setPreview(null);
			setEditing(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setEditing(false);

		getFilePreview(fileKey)
			.then((data) => {
				if (!cancelled) setPreview(data);
			})
			.catch(() => {
				if (!cancelled) {
					toast.error("파일 미리보기를 불러오지 못했습니다.");
					setPreview(null);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [fileKey]);

	const handleEdit = useCallback(async () => {
		if (!fileKey) return;
		try {
			const content = await getFileContent(fileKey);
			setEditContent(content);
			setEditing(true);
		} catch {
			toast.error("파일 내용을 불러오지 못했습니다.");
		}
	}, [fileKey]);

	const handleSave = useCallback(async () => {
		if (!fileKey) return;
		setSaving(true);
		try {
			await updateFileContent(fileKey, editContent);
			toast.success("저장되었습니다.");
			setEditing(false);
			// Refresh preview
			const data = await getFilePreview(fileKey);
			setPreview(data);
		} catch {
			toast.error("저장에 실패했습니다.");
		} finally {
			setSaving(false);
		}
	}, [fileKey, editContent]);

	const handleCancelEdit = useCallback(() => {
		setEditing(false);
		setEditContent("");
	}, []);

	const handleDelete = useCallback(() => {
		if (!fileKey) return;
		onDelete(fileKey);
	}, [fileKey, onDelete]);

	if (!fileKey) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				파일을 선택하세요
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!preview) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				<FileQuestion className="mr-2 size-5" />
				미리보기를 불러올 수 없습니다.
			</div>
		);
	}

	const language = getMonacoLanguage(preview.name);

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="shrink-0 border-b px-4 py-3">
				<h3 className="truncate font-semibold text-sm">{preview.name}</h3>
				<p className="truncate text-muted-foreground text-xs">{preview.key}</p>
				<p className="text-muted-foreground text-xs">{formatSize(preview.size)}</p>
			</div>

			{/* Content */}
			<div className="min-h-0 flex-1">
				{preview.fileType === "text" && (
					<div className="flex h-full flex-col">
						{preview.truncated && !editing && (
							<div className="shrink-0 bg-muted px-4 py-1.5 text-muted-foreground text-xs">
								처음 500줄만 표시 (전체 {preview.totalLines}줄)
							</div>
						)}
						<div className="min-h-0 flex-1">
							<Editor
								height="100%"
								language={language}
								value={editing ? editContent : (preview.content ?? "")}
								onChange={(value) => {
									if (editing) setEditContent(value ?? "");
								}}
								theme="vs-dark"
								options={{
									fontSize: 13,
									fontFamily: "var(--font-geist-mono), monospace",
									minimap: { enabled: false },
									scrollBeyondLastLine: false,
									padding: { top: 12, bottom: 12 },
									automaticLayout: true,
									readOnly: !editing,
									domReadOnly: !editing,
									wordWrap: "on",
								}}
							/>
						</div>
					</div>
				)}

				{preview.fileType === "image" && preview.imageUrl && (
					<div className="flex h-full items-center justify-center p-4">
						<Image
							src={preview.imageUrl}
							alt={preview.name}
							width={800}
							height={600}
							className="max-h-full max-w-full object-contain"
							unoptimized
						/>
					</div>
				)}

				{preview.fileType === "binary" && (
					<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
						<FileQuestion className="size-10" />
						<p>바이너리 파일이라 미리보기가 불가능합니다.</p>
						<p className="text-sm">다운로드하여 확인하세요.</p>
					</div>
				)}
			</div>

			{/* Action bar */}
			<div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
				{preview.fileType === "text" && !editing && (
					<Button variant="outline" size="sm" onClick={handleEdit}>
						<Edit className="mr-1.5 size-4" />
						편집
					</Button>
				)}

				{editing && (
					<>
						<Button size="sm" onClick={handleSave} disabled={saving}>
							{saving ? (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							) : (
								<Save className="mr-1.5 size-4" />
							)}
							저장
						</Button>
						<Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
							<X className="mr-1.5 size-4" />
							취소
						</Button>
					</>
				)}

				<div className="flex-1" />

				<Button variant="outline" size="sm" asChild>
					<a href={`/api/admin/download-file?path=${encodeURIComponent(preview.key)}`} download>
						<Download className="mr-1.5 size-4" />
						다운로드
					</a>
				</Button>

				<Button variant="destructive" size="sm" onClick={handleDelete}>
					<Trash2 className="mr-1.5 size-4" />
					삭제
				</Button>
			</div>
		</div>
	);
}
