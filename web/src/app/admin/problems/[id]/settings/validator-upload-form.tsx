"use client";

import { AlertCircle, CheckCircle, Loader2, Play, Upload, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

interface TestcaseValidationResult {
	testcase_id: number;
	valid: boolean;
	message?: string | null;
}

interface ValidationResults {
	problem_id: number;
	success: boolean;
	testcase_results: TestcaseValidationResult[];
	error_message?: string | null;
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
	const [isLoadingSource, setIsLoadingSource] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [sourceCode, setSourceCode] = useState(DEFAULT_VALIDATOR_TEMPLATE);
	const [validationResults, setValidationResults] = useState<ValidationResults | null>(null);
	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		// Load current validator source code if exists
		if (currentValidatorPath) {
			setIsLoadingSource(true);
			fetch(`/api/admin/get-file-content?path=${encodeURIComponent(currentValidatorPath)}`)
				.then((res) => res.json())
				.then((data) => {
					if (data.content) {
						setSourceCode(data.content);
					}
				})
				.catch((err) => {
					console.error("Failed to load validator source:", err);
				})
				.finally(() => {
					setIsLoadingSource(false);
				});
		}

		return () => {
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
			}
		};
	}, [currentValidatorPath]);

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

	async function pollValidationResult() {
		try {
			const response = await fetch(`/api/admin/validation-result/${problemId}`);
			if (!response.ok) return;

			const data = await response.json();

			if (data.status === "pending") {
				// Still processing
				return;
			}

			// Got results
			setValidationResults(data);
			setIsValidating(false);

			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
				pollIntervalRef.current = null;
			}

			if (data.error_message) {
				setError(`검증 실패: ${data.error_message}`);
			} else if (data.success) {
				setSuccess("모든 테스트케이스가 검증을 통과했습니다!");
			} else {
				setError("일부 테스트케이스가 검증에 실패했습니다.");
			}
		} catch (err) {
			console.error("Polling error:", err);
		}
	}

	async function handleValidate() {
		setIsValidating(true);
		setError(null);
		setSuccess(null);
		setValidationResults(null);

		try {
			const result = await validateTestcases(problemId);
			setSuccess(result.message);

			// Start polling for results
			pollIntervalRef.current = setInterval(pollValidationResult, 1000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "검증 요청 중 오류가 발생했습니다.");
			setIsValidating(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Validator 설정
					{currentValidatorPath && <CheckCircle className="h-5 w-5 text-green-500" />}
				</CardTitle>
				<CardDescription>테스트케이스 입력 형식을 검증하는 Validator를 설정합니다.</CardDescription>
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

				{validationResults?.testcase_results && validationResults.testcase_results.length > 0 && (
					<div className="space-y-2">
						<h4 className="text-sm font-medium">검증 결과:</h4>
						<div className="space-y-1 max-h-[200px] overflow-y-auto">
							{validationResults.testcase_results.map((result) => (
								<div
									key={result.testcase_id}
									className={`flex items-center gap-2 p-2 rounded text-sm ${
										result.valid
											? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
											: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
									}`}
								>
									{result.valid ? (
										<CheckCircle className="h-4 w-4" />
									) : (
										<XCircle className="h-4 w-4" />
									)}
									<span className="font-mono text-xs">
										테스트케이스 #{result.testcase_id}:{" "}
										{result.valid ? "✓ 통과" : `✗ ${result.message || "실패"}`}
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{validationResults?.error_message && (
					<div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
						<p className="text-sm text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap">
							{validationResults.error_message}
						</p>
					</div>
				)}

				<div className="space-y-2">
					<Label htmlFor="validator-source">Validator 소스 코드 (C++)</Label>
					{isLoadingSource ? (
						<div className="flex items-center justify-center min-h-[400px] border rounded-md bg-muted">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : (
						<Textarea
							id="validator-source"
							value={sourceCode}
							onChange={(e) => setSourceCode(e.target.value)}
							className="font-mono text-sm min-h-[400px]"
							placeholder="testlib.h 기반 Validator 코드를 입력하세요..."
							disabled={isUploading || isValidating}
						/>
					)}
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
