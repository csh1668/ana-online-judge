"use client";

import { Check, FileText, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface BulkUploadFormProps {
	problemId: number;
}

export function BulkUploadForm({ problemId }: BulkUploadFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [files, setFiles] = useState<File[]>([]);
	const formRef = useRef<HTMLFormElement>(null);

	function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
		const selectedFiles = Array.from(event.target.files || []);
		setFiles(selectedFiles);
		setError(null);
		setSuccess(null);
	}

	function removeFile(index: number) {
		setFiles((prev) => prev.filter((_, i) => i !== index));
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (files.length === 0) {
			setError("파일을 선택해주세요.");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		setSuccess(null);

		const formData = new FormData();
		formData.append("problemId", problemId.toString());
		formData.append(
			"defaultScore",
			(event.currentTarget.querySelector('[name="defaultScore"]') as HTMLInputElement)?.value ||
				"10"
		);
		formData.append(
			"isHidden",
			(event.currentTarget.querySelector('[name="isHidden"]') as HTMLInputElement)?.checked
				? "true"
				: "false"
		);

		// Add all files
		for (const file of files) {
			formData.append("files", file);
		}

		try {
			const response = await fetch("/api/admin/upload-testcases-bulk", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.error || "업로드 중 오류가 발생했습니다.");
			} else {
				setSuccess(data.message || "테스트케이스가 추가되었습니다.");
				// Reset form
				setFiles([]);
				formRef.current?.reset();
				router.refresh();
			}
		} catch (_err) {
			setError("업로드 중 오류가 발생했습니다.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form ref={formRef} onSubmit={onSubmit} className="space-y-4">
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{success && (
				<Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
					<Check className="h-4 w-4" />
					<AlertDescription>{success}</AlertDescription>
				</Alert>
			)}

			<Alert>
				<AlertDescription className="text-sm space-y-2">
					<p className="font-medium">지원하는 파일명 패턴:</p>
					<ul className="list-disc list-inside space-y-1 text-xs">
						<li>
							<code className="bg-muted px-1 py-0.5 rounded">1.in</code> /{" "}
							<code className="bg-muted px-1 py-0.5 rounded">1.out</code>
						</li>
						<li>
							<code className="bg-muted px-1 py-0.5 rounded">1_input.txt</code> /{" "}
							<code className="bg-muted px-1 py-0.5 rounded">1_output.txt</code>
						</li>
						<li>
							<code className="bg-muted px-1 py-0.5 rounded">1_input</code> /{" "}
							<code className="bg-muted px-1 py-0.5 rounded">1_output</code> (확장자 없음)
						</li>
						<li>
							<code className="bg-muted px-1 py-0.5 rounded">input_1.txt</code> /{" "}
							<code className="bg-muted px-1 py-0.5 rounded">output_1.txt</code>
						</li>
						<li>
							<code className="bg-muted px-1 py-0.5 rounded">input_1</code> /{" "}
							<code className="bg-muted px-1 py-0.5 rounded">output_1</code> (확장자 없음)
						</li>
						<li>
							<code className="bg-muted px-1 py-0.5 rounded">test1.in</code> /{" "}
							<code className="bg-muted px-1 py-0.5 rounded">test1.out</code>
						</li>
					</ul>
					<p className="text-xs text-muted-foreground mt-2">
						* 텍스트 파일(.txt, .in, .out)은 CRLF가 자동으로 LF로 변환됩니다.
					</p>
					<p className="text-xs text-muted-foreground">
						* 바이너리 파일은 원본 그대로 저장됩니다. 확장자 없이도 업로드 가능합니다.
					</p>
				</AlertDescription>
			</Alert>

			{/* File Upload */}
			<div className="space-y-2">
				<Label>테스트케이스 파일</Label>
				<div className="flex items-center gap-2">
				<Input
					type="file"
					multiple
					onChange={handleFilesChange}
					disabled={isSubmitting}
					className="hidden"
					id="bulkFiles"
				/>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start"
						onClick={() => document.getElementById("bulkFiles")?.click()}
						disabled={isSubmitting}
					>
						<Upload className="mr-2 h-4 w-4" />
						파일 선택 (여러 개 가능)
					</Button>
				</div>

				{/* File List */}
				{files.length > 0 && (
					<div className="space-y-1 max-h-[200px] overflow-y-auto border rounded-md p-2">
						{files.map((file, index) => (
							<div
								key={`${file.name}-${index}`}
								className="flex items-center justify-between text-sm p-2 hover:bg-accent rounded"
							>
								<div className="flex items-center gap-2 flex-1 min-w-0">
									<FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
									<span className="truncate font-mono text-xs">{file.name}</span>
									<span className="text-xs text-muted-foreground flex-shrink-0">
										({(file.size / 1024).toFixed(2)} KB)
									</span>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => removeFile(index)}
									disabled={isSubmitting}
									className="flex-shrink-0"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Default Score */}
			<div className="space-y-2">
				<Label htmlFor="defaultScore">기본 점수 (모든 테스트케이스)</Label>
				<Input
					id="defaultScore"
					name="defaultScore"
					type="number"
					defaultValue={10}
					min={0}
					disabled={isSubmitting}
				/>
			</div>

			{/* Is Hidden */}
			<div className="flex items-center space-x-2">
				<Switch id="isHidden" name="isHidden" defaultChecked={true} disabled={isSubmitting} />
				<Label htmlFor="isHidden">숨김 (채점용)</Label>
			</div>

			<Button type="submit" className="w-full" disabled={isSubmitting || files.length === 0}>
				{isSubmitting ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						업로드 중...
					</>
				) : (
					<>
						<Upload className="mr-2 h-4 w-4" />
						{files.length}개 테스트케이스 일괄 추가
					</>
				)}
			</Button>
		</form>
	);
}
