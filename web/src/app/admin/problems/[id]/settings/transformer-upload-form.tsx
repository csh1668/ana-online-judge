"use client";

import { AlertCircle, CheckCircle, Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { uploadTransformer } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface TransformerUploadFormProps {
	problemId: number;
	currentTransformerPath: string | null;
}

const CPP_TRANSFORMER_TEMPLATE = `#include "aoj_transformer.h"

// phase: 1 또는 2. 1회차에는 raw_stage1()이 빈 문자열이다.
void transform(int phase) {
    if (phase == 1) {
        // 1단계: 원본 입력을 그대로 다음 단계로 전달하는 예시
        std::cout << raw_input();
    } else {
        // 2단계: 1단계 유저 출력(stage1)을 검증하고 페이로드를 만든다
        std::string stage1 = raw_stage1();
        if (stage1.empty()) {
            quitf(_pe, "1단계 출력이 비어 있습니다");
        }

        // 검증 로직 예시
        // if (조건 위반) quitf(_wa, "설명: %s", stage1.c_str());

        std::cout << stage1;
    }
}
`;

const PYTHON_TRANSFORMER_TEMPLATE = `from aoj_checker import Transformer

t = Transformer()

if t.phase == 1:
    # 1단계: 원본 입력을 그대로 다음 단계로 전달하는 예시
    print(t.input, end="")
else:
    # 2단계: 1단계 유저 출력(t.stage1)을 검증하고 페이로드를 만든다
    stage1 = t.stage1.strip()
    if not stage1:
        t.presentation_error("1단계 출력이 비어 있습니다")

    # 검증 로직 예시
    # if 조건 위반:
    #     t.wrong_answer("설명")

    print(stage1)
`;

type TransformerLang = "cpp" | "python";

function detectTransformerLang(path: string | null): TransformerLang {
	if (path?.endsWith(".py")) return "python";
	return "cpp";
}

export function TransformerUploadForm({
	problemId,
	currentTransformerPath,
}: TransformerUploadFormProps) {
	const [isUploading, setIsUploading] = useState(false);
	const [isLoadingSource, setIsLoadingSource] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [transformerLang, setTransformerLang] = useState<TransformerLang>(
		detectTransformerLang(currentTransformerPath)
	);
	const [cppSource, setCppSource] = useState(CPP_TRANSFORMER_TEMPLATE);
	const [pythonSource, setPythonSource] = useState(PYTHON_TRANSFORMER_TEMPLATE);

	useEffect(() => {
		if (currentTransformerPath) {
			setIsLoadingSource(true);
			const lang = detectTransformerLang(currentTransformerPath);
			fetch(`/api/admin/get-file-content?path=${encodeURIComponent(currentTransformerPath)}`)
				.then((res) => res.json())
				.then((data) => {
					if (data.content) {
						if (lang === "python") {
							setPythonSource(data.content);
						} else {
							setCppSource(data.content);
						}
					}
				})
				.catch((err) => {
					console.error("Failed to load transformer source:", err);
				})
				.finally(() => {
					setIsLoadingSource(false);
				});
		}
	}, [currentTransformerPath]);

	const sourceCode = transformerLang === "cpp" ? cppSource : pythonSource;
	const filename = transformerLang === "cpp" ? "transformer.cpp" : "transformer.py";

	async function handleUpload() {
		setIsUploading(true);
		setError(null);
		setSuccess(false);

		try {
			await uploadTransformer(problemId, sourceCode, filename);
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
					변환기 설정
					{currentTransformerPath && (
						<CheckCircle className="h-5 w-5 text-[var(--verdict-accepted)]" />
					)}
				</CardTitle>
				<CardDescription>투스탭 문제입니다. C++ 또는 Python 변환기를 업로드하세요.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="p-3 rounded-md bg-muted">
					<p className="text-sm text-muted-foreground">
						변환기는 1회차와 2회차에 각각 한 번씩 호출됩니다. 호출 인자는{" "}
						<code className="font-mono">input.txt stage1.txt phase.txt</code> 세 개이며, 표준출력이
						다음 단계의 표준입력 전체가 됩니다. 1회차 호출에서는{" "}
						<code className="font-mono">stage1.txt</code>가 빈 파일입니다. 종료 코드 0은 통과, 1은
						오답, 2는 형식 오류, 3은 출제자 버그입니다.
					</p>
				</div>

				{currentTransformerPath && (
					<div className="p-3 rounded-md bg-[var(--verdict-accepted-bg)] border border-[var(--verdict-accepted)]">
						<p className="text-sm text-[var(--verdict-accepted)]">
							현재 변환기: {currentTransformerPath}
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
					<div className="flex items-center gap-2 p-3 rounded-md bg-[var(--verdict-accepted-bg)] text-[var(--verdict-accepted)]">
						<CheckCircle className="h-4 w-4" />
						<span className="text-sm">변환기가 성공적으로 업로드되었습니다.</span>
					</div>
				)}

				<Tabs
					value={transformerLang}
					onValueChange={(v) => setTransformerLang(v as TransformerLang)}
				>
					<TabsList>
						<TabsTrigger value="cpp">C++ (aoj_transformer.h)</TabsTrigger>
						<TabsTrigger value="python">Python</TabsTrigger>
					</TabsList>

					<TabsContent value="cpp" className="space-y-2 mt-4">
						<Label htmlFor="transformer-source-cpp">변환기 소스 코드 (C++)</Label>
						{isLoadingSource && transformerLang === "cpp" ? (
							<div className="flex items-center justify-center min-h-[400px] border rounded-md bg-muted">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : (
							<Textarea
								id="transformer-source-cpp"
								value={cppSource}
								onChange={(e) => setCppSource(e.target.value)}
								className="font-mono text-sm min-h-[400px]"
								placeholder="aoj_transformer.h 기반 변환기 코드를 입력하세요..."
								disabled={isUploading}
							/>
						)}
					</TabsContent>

					<TabsContent value="python" className="space-y-2 mt-4">
						<Label htmlFor="transformer-source-python">변환기 소스 코드 (Python)</Label>
						<p className="text-xs text-muted-foreground">
							aoj_checker SDK의 Transformer 클래스를 사용합니다. input, stage1, phase 속성으로
							파일에 접근하고, 페이로드는 print()로 직접 쓰세요. 실패는 wrong_answer() /
							presentation_error() 로 반환하세요.
						</p>
						{isLoadingSource && transformerLang === "python" ? (
							<div className="flex items-center justify-center min-h-[400px] border rounded-md bg-muted">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : (
							<Textarea
								id="transformer-source-python"
								value={pythonSource}
								onChange={(e) => setPythonSource(e.target.value)}
								className="font-mono text-sm min-h-[400px]"
								placeholder="Python 변환기 코드를 입력하세요..."
								disabled={isUploading}
							/>
						)}
					</TabsContent>
				</Tabs>

				<Button onClick={handleUpload} disabled={isUploading || !sourceCode.trim()}>
					{isUploading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							업로드 중...
						</>
					) : (
						<>
							<Upload className="mr-2 h-4 w-4" />
							{transformerLang === "cpp" ? "C++" : "Python"} 변환기 업로드
						</>
					)}
				</Button>
			</CardContent>
		</Card>
	);
}
