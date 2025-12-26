"use client";

import { FileUp, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AnigmaTask1SubmitProps {
	onSubmit: (file: File) => Promise<void>;
	isSubmitting: boolean;
}

export function AnigmaTask1Submit({ onSubmit, isSubmitting }: AnigmaTask1SubmitProps) {
	const [file, setFile] = useState<File | null>(null);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files?.[0]) {
			setFile(e.target.files[0]);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!file) return;
		await onSubmit(file);
	};

	const formatFileSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="input-file">Input 파일</Label>
				<div className="flex gap-2 items-center">
					<Input
						id="input-file"
						type="file"
						onChange={handleFileChange}
						disabled={isSubmitting}
						className="cursor-pointer"
					/>
				</div>
				{file && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<FileUp className="h-4 w-4" />
						<span>{file.name}</span>
						<span className="text-xs">({formatFileSize(file.size)})</span>
					</div>
				)}
				<p className="text-sm text-muted-foreground">
					A와 B의 출력이 다른 입력 파일을 업로드하세요. 텍스트 또는 바이너리 파일 모두 가능합니다.
					(최대 1MB)
				</p>
			</div>

			<Alert className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900">
				<AlertDescription className="text-sm text-purple-800 dark:text-purple-200">
					<ul className="list-disc pl-4 space-y-1">
						<li>제출한 파일로 코드 A와 코드 B를 실행합니다.</li>
						<li>
							두 코드의 출력이 <strong>다르면</strong> 정답입니다.
						</li>
						<li>출력이 같으면 오답 처리됩니다.</li>
					</ul>
				</AlertDescription>
			</Alert>

			<Button type="submit" disabled={!file || isSubmitting} className="w-full">
				{isSubmitting ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						제출 중...
					</>
				) : (
					<>
						<Upload className="mr-2 h-4 w-4" />
						Task 1 제출하기
					</>
				)}
			</Button>
		</form>
	);
}
