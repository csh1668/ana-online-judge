"use client";

import { Check, FileText, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface TestcaseFormProps {
	problemId: number;
}

export function TestcaseForm({ problemId }: TestcaseFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [inputFile, setInputFile] = useState<File | null>(null);
	const [outputFile, setOutputFile] = useState<File | null>(null);
	const [inputDragOver, setInputDragOver] = useState(false);
	const [outputDragOver, setOutputDragOver] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);
	const inputFileRef = useRef<HTMLInputElement>(null);
	const outputFileRef = useRef<HTMLInputElement>(null);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!inputFile || !outputFile) {
			setError("입력 파일과 출력 파일을 모두 선택해주세요.");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		const formData = new FormData();
		formData.append("inputFile", inputFile);
		formData.append("outputFile", outputFile);
		formData.append("problemId", problemId.toString());
		formData.append(
			"score",
			(event.currentTarget.querySelector('[name="score"]') as HTMLInputElement)?.value || "10"
		);
		formData.append(
			"isHidden",
			(event.currentTarget.querySelector('[name="isHidden"]') as HTMLInputElement)?.checked
				? "true"
				: "false"
		);

		try {
			const response = await fetch("/api/admin/upload-testcase", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.error || "업로드 중 오류가 발생했습니다.");
			} else {
				// Reset form
				setInputFile(null);
				setOutputFile(null);
				formRef.current?.reset();
				router.refresh();
			}
		} catch {
			setError("업로드 중 오류가 발생했습니다.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form ref={formRef} onSubmit={onSubmit} className="space-y-4">
			{error && (
				<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				{/* Input File */}
				<div className="space-y-2">
					<Label>입력 파일</Label>
					<Input
						ref={inputFileRef}
						type="file"
						onChange={(e) => {
							setInputFile(e.target.files?.[0] || null);
							e.target.value = "";
						}}
						disabled={isSubmitting}
						className="hidden"
					/>
					<div
						role="button"
						tabIndex={isSubmitting ? -1 : 0}
						aria-disabled={isSubmitting}
						className={cn(
							"flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[2px] border-2 border-dashed p-4 text-center transition-colors",
							isSubmitting
								? "cursor-not-allowed opacity-60 border-muted-foreground/25"
								: inputDragOver
									? "border-primary bg-primary/5 cursor-pointer"
									: "border-muted-foreground/25 hover:border-primary/50 cursor-pointer"
						)}
						onClick={() => {
							if (!isSubmitting) inputFileRef.current?.click();
						}}
						onKeyDown={(e) => {
							if (isSubmitting) return;
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								inputFileRef.current?.click();
							}
						}}
						onDragOver={(e) => {
							e.preventDefault();
							if (!isSubmitting) setInputDragOver(true);
						}}
						onDragLeave={() => setInputDragOver(false)}
						onDrop={(e) => {
							e.preventDefault();
							setInputDragOver(false);
							if (isSubmitting) return;
							const f = e.dataTransfer.files?.[0];
							if (f) setInputFile(f);
						}}
					>
						{inputFile ? (
							<>
								<Check className="h-6 w-6 text-green-500" />
								<p className="max-w-full truncate px-2 font-mono text-sm">{inputFile.name}</p>
								<p className="text-xs text-muted-foreground">
									{(inputFile.size / 1024).toFixed(2)} KB
								</p>
							</>
						) : (
							<>
								<Upload className="h-6 w-6 text-muted-foreground" />
								<p className="text-sm text-muted-foreground">입력 파일 드래그 또는 클릭</p>
							</>
						)}
					</div>
				</div>

				{/* Output File */}
				<div className="space-y-2">
					<Label>출력 파일</Label>
					<Input
						ref={outputFileRef}
						type="file"
						onChange={(e) => {
							setOutputFile(e.target.files?.[0] || null);
							e.target.value = "";
						}}
						disabled={isSubmitting}
						className="hidden"
					/>
					<div
						role="button"
						tabIndex={isSubmitting ? -1 : 0}
						aria-disabled={isSubmitting}
						className={cn(
							"flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[2px] border-2 border-dashed p-4 text-center transition-colors",
							isSubmitting
								? "cursor-not-allowed opacity-60 border-muted-foreground/25"
								: outputDragOver
									? "border-primary bg-primary/5 cursor-pointer"
									: "border-muted-foreground/25 hover:border-primary/50 cursor-pointer"
						)}
						onClick={() => {
							if (!isSubmitting) outputFileRef.current?.click();
						}}
						onKeyDown={(e) => {
							if (isSubmitting) return;
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								outputFileRef.current?.click();
							}
						}}
						onDragOver={(e) => {
							e.preventDefault();
							if (!isSubmitting) setOutputDragOver(true);
						}}
						onDragLeave={() => setOutputDragOver(false)}
						onDrop={(e) => {
							e.preventDefault();
							setOutputDragOver(false);
							if (isSubmitting) return;
							const f = e.dataTransfer.files?.[0];
							if (f) setOutputFile(f);
						}}
					>
						{outputFile ? (
							<>
								<Check className="h-6 w-6 text-green-500" />
								<p className="max-w-full truncate px-2 font-mono text-sm">{outputFile.name}</p>
								<p className="text-xs text-muted-foreground">
									{(outputFile.size / 1024).toFixed(2)} KB
								</p>
							</>
						) : (
							<>
								<Upload className="h-6 w-6 text-muted-foreground" />
								<p className="text-sm text-muted-foreground">출력 파일 드래그 또는 클릭</p>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Score */}
			<div className="space-y-2">
				<Label htmlFor="score">점수</Label>
				<Input
					id="score"
					name="score"
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

			<Button type="submit" className="w-full" disabled={isSubmitting || !inputFile || !outputFile}>
				{isSubmitting ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						업로드 중...
					</>
				) : (
					<>
						<FileText className="mr-2 h-4 w-4" />
						테스트케이스 추가
					</>
				)}
			</Button>
		</form>
	);
}
