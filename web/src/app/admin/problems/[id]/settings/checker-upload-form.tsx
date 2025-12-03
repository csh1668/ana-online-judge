"use client";

import { useState } from "react";
import { Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { uploadChecker } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProblemType } from "@/db/schema";

interface CheckerUploadFormProps {
	problemId: number;
	problemType: ProblemType;
	currentCheckerPath: string | null;
}

const DEFAULT_CHECKER_TEMPLATE = `#include "testlib.h"

int main(int argc, char* argv[]) {
    registerTestlibCmd(argc, argv);
    
    // Read expected answer
    // inf = input file
    // ouf = user output
    // ans = expected answer
    
    // Example: compare integers
    int expected = ans.readInt();
    int userAnswer = ouf.readInt();
    
    if (expected == userAnswer) {
        quitf(_ok, "Correct answer");
    } else {
        quitf(_wa, "Expected %d, but got %d", expected, userAnswer);
    }
    
    return 0;
}
`;

export function CheckerUploadForm({
	problemId,
	problemType,
	currentCheckerPath,
}: CheckerUploadFormProps) {
	const [isUploading, setIsUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [sourceCode, setSourceCode] = useState(DEFAULT_CHECKER_TEMPLATE);

	const isSpecialJudge = problemType === "special_judge";

	async function handleUpload() {
		setIsUploading(true);
		setError(null);
		setSuccess(false);

		try {
			await uploadChecker(problemId, sourceCode);
			setSuccess(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
		} finally {
			setIsUploading(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					체커 설정
					{currentCheckerPath && (
						<CheckCircle className="h-5 w-5 text-green-500" />
					)}
				</CardTitle>
				<CardDescription>
					{isSpecialJudge
						? "스페셜 저지 문제입니다. testlib.h 기반 체커를 업로드하세요."
						: "ICPC 문제는 기본 문자열 비교를 사용합니다."}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!isSpecialJudge && (
					<div className="p-4 rounded-md bg-muted">
						<p className="text-sm text-muted-foreground">
							이 문제는 ICPC (일반) 유형입니다. 체커를 사용하려면 먼저 문제 유형을
							&quot;스페셜 저지&quot;로 변경하세요.
						</p>
					</div>
				)}

				{isSpecialJudge && (
					<>
						{currentCheckerPath && (
							<div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
								<p className="text-sm text-green-700 dark:text-green-300">
									현재 체커: {currentCheckerPath}
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
								<span className="text-sm">체커가 성공적으로 업로드되었습니다.</span>
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="checker-source">체커 소스 코드 (C++)</Label>
							<Textarea
								id="checker-source"
								value={sourceCode}
								onChange={(e) => setSourceCode(e.target.value)}
								className="font-mono text-sm min-h-[400px]"
								placeholder="testlib.h 기반 체커 코드를 입력하세요..."
								disabled={isUploading}
							/>
						</div>

						<Button
							onClick={handleUpload}
							disabled={isUploading || !sourceCode.trim()}
						>
							{isUploading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									업로드 중...
								</>
							) : (
								<>
									<Upload className="mr-2 h-4 w-4" />
									체커 업로드
								</>
							)}
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}


