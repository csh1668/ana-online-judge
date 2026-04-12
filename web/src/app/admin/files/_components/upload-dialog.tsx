"use client";

import { Loader2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadFiles } from "@/actions/file-manager";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface UploadDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentPrefix: string;
	onUploaded: () => void;
}

export function UploadDialog({ open, onOpenChange, currentPrefix, onUploaded }: UploadDialogProps) {
	const [files, setFiles] = useState<File[]>([]);
	const [loading, setLoading] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) {
				setFiles([]);
				setDragOver(false);
			}
			onOpenChange(next);
		},
		[onOpenChange]
	);

	const addFiles = useCallback((incoming: FileList | null) => {
		if (!incoming) return;
		setFiles((prev) => {
			const existing = new Set(prev.map((f) => f.name));
			const newFiles = Array.from(incoming).filter((f) => !existing.has(f.name));
			return [...prev, ...newFiles];
		});
	}, []);

	const removeFile = useCallback((name: string) => {
		setFiles((prev) => prev.filter((f) => f.name !== name));
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			addFiles(e.dataTransfer.files);
		},
		[addFiles]
	);

	const handleUpload = useCallback(async () => {
		if (files.length === 0) return;
		setLoading(true);
		try {
			const formData = new FormData();
			for (const file of files) {
				formData.append("files", file);
			}
			await uploadFiles(currentPrefix, formData);
			toast.success(`${files.length}개 파일이 업로드되었습니다.`);
			setFiles([]);
			onOpenChange(false);
			onUploaded();
		} catch {
			toast.error("파일 업로드에 실패했습니다.");
		} finally {
			setLoading(false);
		}
	}, [files, currentPrefix, onOpenChange, onUploaded]);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>파일 업로드</DialogTitle>
					<DialogDescription>/{currentPrefix}</DialogDescription>
				</DialogHeader>

				<div
					role="button"
					tabIndex={0}
					className={`flex flex-col items-center justify-center gap-2 rounded-[2px] border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
						dragOver
							? "border-primary bg-primary/5"
							: "border-muted-foreground/25 hover:border-primary/50"
					}`}
					onClick={() => inputRef.current?.click()}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							inputRef.current?.click();
						}
					}}
					onDragOver={(e) => {
						e.preventDefault();
						setDragOver(true);
					}}
					onDragLeave={() => setDragOver(false)}
					onDrop={handleDrop}
				>
					<Upload className="h-8 w-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">파일을 드래그하거나 클릭하여 선택하세요</p>
				</div>

				<input
					ref={inputRef}
					type="file"
					multiple
					className="hidden"
					onChange={(e) => {
						addFiles(e.target.files);
						e.target.value = "";
					}}
				/>

				{files.length > 0 && (
					<div className="max-h-40 space-y-1 overflow-y-auto">
						{files.map((file) => (
							<div
								key={file.name}
								className="flex items-center justify-between rounded-[2px] border px-3 py-1.5 text-sm"
							>
								<span className="truncate">{file.name}</span>
								<Button
									size="icon"
									variant="ghost"
									className="h-6 w-6 shrink-0"
									onClick={() => removeFile(file.name)}
								>
									<X className="h-3 w-3" />
								</Button>
							</div>
						))}
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
						취소
					</Button>
					<Button onClick={handleUpload} disabled={files.length === 0 || loading}>
						{loading ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								업로드 중...
							</>
						) : (
							<>업로드 ({files.length})</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
