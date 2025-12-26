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
		<Card>
			<CardContent className="pt-6">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="zip-file">Anigma 제출 (ZIP 파일)</Label>
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
							Makefile이 포함된 ZIP 파일을 업로드하세요. (최대 10MB)
						</p>
					</div>

					<Alert>
						<AlertTitle>제출 가이드</AlertTitle>
						<AlertDescription className="text-sm mt-2">
							<ul className="list-disc pl-4 space-y-1">
								<li>
									ZIP 파일 최상위에 <code>Makefile</code>이 있어야 합니다.
								</li>
								<li>
									<code>make build</code> 타겟: 소스 코드를 컴파일합니다.
								</li>
								<li>
									<code>make run</code> 타겟: 프로그램을 실행합니다. (<code>INPUT</code> 변수로 입력
									파일 경로 전달)
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
								제출하기
							</>
						)}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
