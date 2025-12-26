"use client";

import { Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createUsersFromCsv } from "@/actions/users";
import { Button } from "@/components/ui/button";

interface CsvResult {
	created: number;
	errors: { row: number; username: string; error: string }[];
}

export function CsvUserUpload() {
	const [file, setFile] = useState<File | null>(null);
	const [result, setResult] = useState<CsvResult | null>(null);
	const [isPending, startTransition] = useTransition();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0];
		if (selectedFile) {
			if (!selectedFile.name.endsWith(".csv")) {
				toast.error("CSV 파일만 업로드 가능합니다.");
				return;
			}
			setFile(selectedFile);
			setResult(null);
		}
	};

	const handleUpload = () => {
		if (!file) return;

		startTransition(async () => {
			try {
				const text = await file.text();
				const uploadResult = await createUsersFromCsv(text);
				setResult(uploadResult);

				if (uploadResult.errors.length === 0) {
					toast.success(`${uploadResult.created}개의 계정이 생성되었습니다.`);
				} else if (uploadResult.created > 0) {
					toast.warning(`${uploadResult.created}개 생성, ${uploadResult.errors.length}개 실패`);
				} else {
					toast.error("계정 생성에 실패했습니다.");
				}

				setFile(null);
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			} catch (_error) {
				toast.error("CSV 처리 중 오류가 발생했습니다.");
			}
		});
	};

	const downloadTemplate = () => {
		const template =
			"username,name,password,email\njohn_doe,John Doe,password123,john@example.com\njane_smith,Jane Smith,securepass456,";
		const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "users_template.csv";
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<FileSpreadsheet className="h-4 w-4" />
				<span>CSV 형식: username, name, password, email (email은 선택)</span>
			</div>

			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv"
						onChange={handleFileChange}
						className="hidden"
						id="csv-upload"
					/>
					<label htmlFor="csv-upload">
						<Button variant="outline" asChild>
							<span className="cursor-pointer">
								<Upload className="mr-2 h-4 w-4" />
								파일 선택
							</span>
						</Button>
					</label>
					<Button variant="ghost" size="sm" onClick={downloadTemplate}>
						<Download className="mr-2 h-4 w-4" />
						템플릿 다운로드
					</Button>
				</div>

				{file && (
					<div className="flex items-center gap-2 p-3 bg-muted rounded-md">
						<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
						<span className="text-sm flex-1">{file.name}</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={() => {
								setFile(null);
								if (fileInputRef.current) {
									fileInputRef.current.value = "";
								}
							}}
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				)}

				<Button onClick={handleUpload} disabled={!file || isPending} className="w-fit">
					{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					계정 생성
				</Button>
			</div>

			{result && (
				<div className="space-y-2">
					<p className="text-sm font-medium">
						결과: {result.created}개 생성
						{result.errors.length > 0 && `, ${result.errors.length}개 실패`}
					</p>
					{result.errors.length > 0 && (
						<div className="max-h-40 overflow-auto rounded-md border p-2">
							{result.errors.map((err) => (
								<p key={`${err.row}-${err.username}`} className="text-xs text-destructive">
									행 {err.row}: {err.username} - {err.error}
								</p>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
