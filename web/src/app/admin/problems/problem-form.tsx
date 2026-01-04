"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProblem, updateProblem } from "@/actions/admin";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Language, ProblemType } from "@/db/schema";
import { LANGUAGES } from "@/lib/languages";

const DEFAULT_CONTENT = `## 문제

문제 설명을 입력하세요.

## 입력

입력 형식을 설명하세요.

## 출력

출력 형식을 설명하세요.

## 예제 입력 1

\`\`\`
예제 입력
\`\`\`

## 예제 출력 1

\`\`\`
예제 출력
\`\`\`

## 힌트

LaTeX 수식 예시: $a^2 + b^2 = c^2$

블록 수식:
$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$
`;

interface ProblemFormProps {
	problem?: {
		id: number;
		title: string;
		content: string;
		timeLimit: number;
		memoryLimit: number;
		maxScore: number;
		isPublic: boolean;
		problemType: ProblemType;
		checkerPath: string | null;
		validatorPath: string | null;
		referenceCodePath: string | null;
		solutionCodePath: string | null;
		allowedLanguages: string[] | null;
	};
}

export function ProblemForm({ problem }: ProblemFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState(problem?.content || DEFAULT_CONTENT);
	const [problemType, setProblemType] = useState<ProblemType>(problem?.problemType || "icpc");

	const DEFAULT_MAX_SCORE = 100;
	const [allowedLanguages, setAllowedLanguages] = useState<Language[]>(
		problem?.allowedLanguages
			? (problem.allowedLanguages.filter((lang): lang is Language =>
				["c", "cpp", "python", "java"].includes(lang)
			) as Language[])
			: []
	);
	const [referenceCodeFile, setReferenceCodeFile] = useState<File | null>(null);
	const [solutionCodeFile, setSolutionCodeFile] = useState<File | null>(null);
	const [maxScore, setMaxScore] = useState<number>(
		problem?.maxScore || DEFAULT_MAX_SCORE
	);

	const isEditing = !!problem;

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const formData = new FormData(event.currentTarget);
		const customIdValue = formData.get("customId") as string;
		const customId = customIdValue ? parseInt(customIdValue, 10) : undefined;

		interface ProblemData {
			id?: number;
			title: string;
			content: string;
			timeLimit: number;
			memoryLimit: number;
			maxScore: number;
			isPublic: boolean;
			problemType?: "icpc" | "special_judge" | "anigma";
			allowedLanguages?: string[] | null;
			referenceCodeFile?: File | null;
			solutionCodeFile?: File | null;
		}

		const data: ProblemData = {
			id: customId,
			title: formData.get("title") as string,
			content: content,
			timeLimit: parseInt(formData.get("timeLimit") as string, 10),
			memoryLimit: parseInt(formData.get("memoryLimit") as string, 10),
			maxScore: parseInt(formData.get("maxScore") as string, 10),
			isPublic: formData.get("isPublic") === "on",
			problemType,
			allowedLanguages: allowedLanguages.length > 0 ? allowedLanguages : null,
		};

		// ANIGMA 문제이고 코드 파일이 있으면 File 객체로 전달
		if (problemType === "anigma") {
			if (referenceCodeFile) {
				data.referenceCodeFile = referenceCodeFile;
			}
			if (solutionCodeFile) {
				data.solutionCodeFile = solutionCodeFile;
			}
		}

		try {
			if (isEditing) {
				await updateProblem(problem.id, data);
				router.push("/admin/problems");
			} else {
				const newProblem = await createProblem(data);
				router.push(`/admin/problems/${newProblem.id}/testcases`);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit}>
			<Card>
				<CardHeader>
					<CardTitle>{isEditing ? "문제 수정" : "문제 정보"}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{error && (
						<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
					)}

					{!isEditing && (
						<div className="space-y-2">
							<Label htmlFor="customId">문제 ID (선택사항)</Label>
							<Input
								id="customId"
								name="customId"
								type="number"
								placeholder="비워두면 자동 할당됩니다"
								min={1}
								disabled={isSubmitting}
							/>
							<p className="text-xs text-muted-foreground">
								문제 ID를 지정하지 않으면 자동으로 증가하는 번호가 할당됩니다.
							</p>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="title">제목</Label>
						<Input
							id="title"
							name="title"
							defaultValue={problem?.title || ""}
							required
							disabled={isSubmitting}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="timeLimit">시간 제한 (ms)</Label>
							<Input
								id="timeLimit"
								name="timeLimit"
								type="number"
								defaultValue={problem?.timeLimit || 1000}
								min={100}
								max={10000}
								required
								disabled={isSubmitting}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="memoryLimit">메모리 제한 (MB)</Label>
							<Input
								id="memoryLimit"
								name="memoryLimit"
								type="number"
								defaultValue={problem?.memoryLimit || 256}
								min={16}
								max={1024}
								required
								disabled={isSubmitting}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="maxScore">최대 점수</Label>
							<Input
								id="maxScore"
								name="maxScore"
								type="number"
								value={maxScore}
								onChange={(e) => setMaxScore(parseInt(e.target.value, 10) || 0)}
								min={1}
								max={1000}
								required
								disabled={isSubmitting}
							/>
							{problemType === "anigma" && (
								<p className="text-xs text-muted-foreground">
									ANIGMA: 무조건 100점 만점으로 설정
								</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor="problemType">문제 유형</Label>
							<Select
								value={problemType}
								onValueChange={(value) => {
									const newType = value as ProblemType;
									setProblemType(newType);
									// 문제 유형 변경 시 max_score 기본값도 변경 (편집 중이 아닌 새 문제 생성 시만)
									if (!problem) {
										setMaxScore(DEFAULT_MAX_SCORE);
									}
								}}
								disabled={isSubmitting}
							>
								<SelectTrigger id="problemType">
									<SelectValue placeholder="문제 유형 선택" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="icpc">ICPC (일반)</SelectItem>
									<SelectItem value="special_judge">스페셜 저지</SelectItem>
									<SelectItem value="anigma">ANIGMA</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{problemType === "special_judge" && (
						<div className="p-4 border rounded-md bg-muted/50">
							<p className="text-sm text-muted-foreground">
								스페셜 저지 문제입니다. 문제 저장 후 &quot;설정&quot; 탭에서 체커를 업로드해주세요.
							</p>
							{problem?.checkerPath && (
								<p className="text-sm text-green-600 mt-2">
									✓ 체커가 설정되어 있습니다: {problem.checkerPath}
								</p>
							)}
						</div>
					)}

					{problemType === "anigma" && (
						<div className="space-y-4">
							<div className="p-4 border rounded-md bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900">
								<p className="text-sm text-purple-900 dark:text-purple-100 font-medium mb-2">
									ANIGMA 문제
								</p>
								<ul className="text-sm text-purple-800 dark:text-purple-200 list-disc list-inside space-y-1">
									<li>Task 1 (30점): 사용자가 input 파일을 제출, A와 B의 출력이 달라야 정답</li>
									<li>Task 2 (50점): 사용자가 ZIP 파일을 제출, 테스트케이스 통과</li>
									<li>보너스 (최대 20점): 대회 제출 시 편집 거리 기반 동적 계산</li>
								</ul>
								<p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
									※ 비대회: max_score=70 (보너스 없음) / 대회: max_score=50 + 보너스 최대 20점
								</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="referenceCode">문제 제공 코드 A (ZIP 파일)</Label>
									<Input
										id="referenceCode"
										type="file"
										accept=".zip"
										onChange={(e) => {
											if (e.target.files?.[0]) {
												setReferenceCodeFile(e.target.files[0]);
											}
										}}
										disabled={isSubmitting}
										className="cursor-pointer"
									/>
									<p className="text-sm text-muted-foreground">
										Task 1에서 A로 사용될 코드 (Makefile 포함 ZIP)
									</p>
									{problem?.referenceCodePath && (
										<p className="text-sm text-green-600 dark:text-green-400">
											✓ 코드 A가 설정되어 있습니다
										</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="solutionCode">정답 코드 B (ZIP 파일)</Label>
									<Input
										id="solutionCode"
										type="file"
										accept=".zip"
										onChange={(e) => {
											if (e.target.files?.[0]) {
												setSolutionCodeFile(e.target.files[0]);
											}
										}}
										disabled={isSubmitting}
										className="cursor-pointer"
									/>
									<p className="text-sm text-muted-foreground">
										Task 1에서 B로 사용될 정답 코드 (Makefile 포함 ZIP)
									</p>
									{problem?.solutionCodePath && (
										<p className="text-sm text-green-600 dark:text-green-400">
											✓ 코드 B가 설정되어 있습니다
										</p>
									)}
								</div>
							</div>
						</div>
					)}

					<div className="space-y-2">
						<Label>지문</Label>
						<MarkdownEditor
							value={content}
							onChange={setContent}
							problemId={problem?.id}
							disabled={isSubmitting}
							minHeight="500px"
						/>
					</div>

					<div className="space-y-2">
						<Label>허용 언어 (선택하지 않으면 모든 언어 허용)</Label>
						<div className="flex flex-wrap gap-4 p-4 border rounded-md">
							{LANGUAGES.map((lang) => (
								<div key={lang.value} className="flex items-center space-x-2">
									<Checkbox
										id={`lang-${lang.value}`}
										checked={allowedLanguages.includes(lang.value)}
										onCheckedChange={(checked) => {
											if (checked) {
												setAllowedLanguages([...allowedLanguages, lang.value]);
											} else {
												setAllowedLanguages(allowedLanguages.filter((l) => l !== lang.value));
											}
										}}
										disabled={isSubmitting}
									/>
									<Label htmlFor={`lang-${lang.value}`} className="cursor-pointer font-normal">
										{lang.label}
									</Label>
								</div>
							))}
						</div>
					</div>

					<div className="flex items-center space-x-2">
						<Switch
							id="isPublic"
							name="isPublic"
							defaultChecked={problem?.isPublic || false}
							disabled={isSubmitting}
						/>
						<Label htmlFor="isPublic">공개</Label>
					</div>

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => router.back()}
							disabled={isSubmitting}
						>
							취소
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isEditing ? "수정" : "다음 (테스트케이스 추가)"}
						</Button>
					</div>
				</CardContent>
			</Card>
		</form>
	);
}
