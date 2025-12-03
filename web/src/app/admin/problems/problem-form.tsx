"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProblem, updateProblem } from "@/actions/admin";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ProblemType } from "@/db/schema";

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
		isPublic: boolean;
		problemType: ProblemType;
		checkerPath: string | null;
		validatorPath: string | null;
	};
}

export function ProblemForm({ problem }: ProblemFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState(problem?.content || DEFAULT_CONTENT);
	const [problemType, setProblemType] = useState<ProblemType>(
		problem?.problemType || "icpc"
	);

	const isEditing = !!problem;

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const formData = new FormData(event.currentTarget);
		const data = {
			title: formData.get("title") as string,
			content: content,
			timeLimit: parseInt(formData.get("timeLimit") as string, 10),
			memoryLimit: parseInt(formData.get("memoryLimit") as string, 10),
			isPublic: formData.get("isPublic") === "on",
			problemType,
		};

		try {
			if (isEditing) {
				await updateProblem(problem.id, data);
				router.push("/admin/problems");
			} else {
				const newProblem = await createProblem(data);
				router.push(`/admin/problems/${newProblem.id}/testcases`);
			}
		} catch {
			setError("저장 중 오류가 발생했습니다.");
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

					<div className="grid grid-cols-3 gap-4">
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
							<Label htmlFor="problemType">문제 유형</Label>
							<Select
								value={problemType}
								onValueChange={(value) => setProblemType(value as ProblemType)}
								disabled={isSubmitting}
							>
								<SelectTrigger id="problemType">
									<SelectValue placeholder="문제 유형 선택" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="icpc">ICPC (일반)</SelectItem>
									<SelectItem value="special_judge">스페셜 저지</SelectItem>
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
