"use client";

import { Check, FileText, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface TestcaseFormProps {
	problemId: number;
}

export function TestcaseForm({ problemId }: TestcaseFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [inputFile, setInputFile] = useState<File | null>(null);
	const [outputFile, setOutputFile] = useState<File | null>(null);
	const formRef = useRef<HTMLFormElement>(null);

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

			{/* Input File */}
			<div className="space-y-2">
				<Label>입력 파일</Label>
				<div className="flex items-center gap-2">
					<Input
						type="file"
						onChange={(e) => setInputFile(e.target.files?.[0] || null)}
						disabled={isSubmitting}
						className="hidden"
						id="inputFile"
					/>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start"
						onClick={() => document.getElementById("inputFile")?.click()}
						disabled={isSubmitting}
					>
						{inputFile ? (
							<>
								<Check className="mr-2 h-4 w-4 text-green-500" />
								{inputFile.name}
							</>
						) : (
							<>
								<Upload className="mr-2 h-4 w-4" />
								입력 파일 선택
							</>
						)}
					</Button>
				</div>
				{inputFile && (
					<p className="text-xs text-muted-foreground">
						크기: {(inputFile.size / 1024).toFixed(2)} KB
					</p>
				)}
			</div>

			{/* Output File */}
			<div className="space-y-2">
				<Label>출력 파일</Label>
				<div className="flex items-center gap-2">
					<Input
						type="file"
						onChange={(e) => setOutputFile(e.target.files?.[0] || null)}
						disabled={isSubmitting}
						className="hidden"
						id="outputFile"
					/>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start"
						onClick={() => document.getElementById("outputFile")?.click()}
						disabled={isSubmitting}
					>
						{outputFile ? (
							<>
								<Check className="mr-2 h-4 w-4 text-green-500" />
								{outputFile.name}
							</>
						) : (
							<>
								<Upload className="mr-2 h-4 w-4" />
								출력 파일 선택
							</>
						)}
					</Button>
				</div>
				{outputFile && (
					<p className="text-xs text-muted-foreground">
						크기: {(outputFile.size / 1024).toFixed(2)} KB
					</p>
				)}
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
