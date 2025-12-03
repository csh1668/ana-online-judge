"use client";

import { useState } from "react";
import { Loader2, Upload, CheckCircle, AlertCircle, Play } from "lucide-react";
import { uploadValidator, validateTestcases } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ValidatorUploadFormProps {
	problemId: number;
	currentValidatorPath: string | null;
	testcaseCount: number;
}

const DEFAULT_VALIDATOR_TEMPLATE = `#include "testlib.h"

int main(int argc, char* argv[]) {
    registerValidation(argc, argv);
    
    // Example: read N (1 <= N <= 100000)
    int n = inf.readInt(1, 100000, "n");
    inf.readEoln();
    
    // Example: read N integers (1 <= a_i <= 1000000000)
    for (int i = 0; i < n; i++) {
        if (i > 0) inf.readSpace();
        inf.readInt(1, 1000000000, "a_i");
    }
    inf.readEoln();
    
    inf.readEof();
    
    return 0;
}
`;

export function ValidatorUploadForm({
	problemId,
	currentValidatorPath,
	testcaseCount,
}: ValidatorUploadFormProps) {
	const [isUploading, setIsUploading] = useState(false);
	const [isValidating, setIsValidating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [sourceCode, setSourceCode] = useState(DEFAULT_VALIDATOR_TEMPLATE);

	async function handleUpload() {
		setIsUploading(true);
		setError(null);
		setSuccess(null);

		try {
			await uploadValidator(problemId, sourceCode);
			setSuccess("Validator가 성공적으로 업로드되었습니다.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
		} finally {
			setIsUploading(false);
		}
	}

	async function handleValidate() {
		setIsValidating(true);
		setError(null);
		setSuccess(null);

		try {
			const result = await validateTestcases(problemId);
			setSuccess(result.message);
		} catch (err) {
			setError(err instanceof Error ? err.message : "검증 요청 중 오류가 발생했습니다.");
		} finally {
			setIsValidating(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Validator 설정
					{currentValidatorPath && (
						<CheckCircle className="h-5 w-5 text-green-500" />
					)}
				</CardTitle>
				<CardDescription>
					테스트케이스 입력 형식을 검증하는 Validator를 설정합니다.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{currentValidatorPath && (
					<div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
						<p className="text-sm text-green-700 dark:text-green-300">
							현재 Validator: {currentValidatorPath}
						</p>
					</div>
				)}

				{error && (
					<div className="flex items-center gap-2 p-3 rounded-md bg-destructive/15 text-destructive">
						<AlertCircle className="h-4 w-4" />
						<span className="text-sm">{error}</span>
					</div>
				)}

				{success && (
					<div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300">
						<CheckCircle className="h-4 w-4" />
						<span className="text-sm">{success}</span>
					</div>
				)}

				<div className="space-y-2">
					<Label htmlFor="validator-source">Validator 소스 코드 (C++)</Label>
					<Textarea
						id="validator-source"
						value={sourceCode}
						onChange={(e) => setSourceCode(e.target.value)}
						className="font-mono text-sm min-h-[400px]"
						placeholder="testlib.h 기반 Validator 코드를 입력하세요..."
						disabled={isUploading || isValidating}
					/>
				</div>

				<div className="flex gap-2">
					<Button
						onClick={handleUpload}
						disabled={isUploading || isValidating || !sourceCode.trim()}
					>
						{isUploading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								업로드 중...
							</>
						) : (
							<>
								<Upload className="mr-2 h-4 w-4" />
								Validator 업로드
							</>
						)}
					</Button>

					{currentValidatorPath && testcaseCount > 0 && (
						<Button
							variant="outline"
							onClick={handleValidate}
							disabled={isUploading || isValidating}
						>
							{isValidating ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									검증 중...
								</>
							) : (
								<>
									<Play className="mr-2 h-4 w-4" />
									테스트케이스 검증 ({testcaseCount}개)
								</>
							)}
						</Button>
					)}
				</div>

				{!currentValidatorPath && testcaseCount > 0 && (
					<p className="text-sm text-muted-foreground">
						Validator를 업로드하면 {testcaseCount}개의 테스트케이스를 검증할 수 있습니다.
					</p>
				)}

				{testcaseCount === 0 && (
					<p className="text-sm text-muted-foreground">
						테스트케이스가 없습니다. 먼저 테스트케이스를 추가해주세요.
					</p>
				)}
			</CardContent>
		</Card>
	);
}


