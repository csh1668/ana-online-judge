"use client";

import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AnigmaSubmitProps {
	onSubmit: (file: File) => Promise<void>;
	isSubmitting: boolean;
}

export function AnigmaSubmit({ onSubmit, isSubmitting }: AnigmaSubmitProps) {
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

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<div className="flex gap-2 items-center">
					<Input
						id="zip-file"
						type="file"
						accept=".zip"
						onChange={handleFileChange}
						disabled={isSubmitting}
						className="cursor-pointer"
					/>
				</div>
				<p className="text-sm text-muted-foreground">
					Makefile이 포함된 zip 파일 제출 (최대 10MB)
				</p>
			</div>

			<Alert className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900">
				<AlertDescription className="text-sm text-purple-800 dark:text-purple-200">
					<ul className="list-disc pl-4 space-y-1">
						<li>
							zip 파일 최상위에 <code>Makefile</code>이 있어야 합니다.
						</li>
						<li>
							<code>make build</code> 명령어로 빌드해야 합니다.
						</li>
						<li>
							<code>make run file=(file_path)</code> 명령어로 프로그램을 실행해야 합니다.
						</li>
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
						Task 2 제출하기
					</>
				)}
			</Button>
		</form>
	);
}
