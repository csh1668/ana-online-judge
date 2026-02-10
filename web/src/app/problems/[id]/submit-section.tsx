"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { submitAnigmaCode, submitAnigmaTask1 } from "@/actions/anigma-submissions";
import { submitCode } from "@/actions/submissions";
import { AnigmaSubmit } from "@/components/problems/anigma-submit";
import { AnigmaTask1Submit } from "@/components/problems/anigma-task1-submit";
import { CodeSubmit } from "@/components/problems/code-submit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Language, ProblemType } from "@/db/schema";

interface ProblemSubmitSectionProps {
	problemId: number;
	problemType: ProblemType;
	judgeAvailable?: boolean;
	allowedLanguages?: string[] | null;
	contestId?: number;
}

export function ProblemSubmitSection({
	problemId,
	problemType,
	judgeAvailable = true,
	allowedLanguages,
	contestId,
}: ProblemSubmitSectionProps) {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [isSubmittingTask1, setIsSubmittingTask1] = useState(false);
	const [isSubmittingTask2, setIsSubmittingTask2] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (code: string, language: Language) => {
		if (!session?.user?.id) {
			router.push("/login");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const result = await submitCode({
				problemId,
				code,
				language,
				userId: parseInt(session.user.id, 10),
				contestId,
			});

			if (result.error) {
				setError(result.error);
			} else if (result.submissionId) {
				router.push(`/submissions/${result.submissionId}`);
			}
		} catch {
			setError("제출 중 오류가 발생했습니다.");
		} finally {
			setIsSubmitting(false);
		}
	};

	// ANIGMA Task 1: input 파일 제출
	const handleAnigmaTask1Submit = async (file: File) => {
		if (!session?.user?.id) {
			router.push("/login");
			return;
		}

		setIsSubmittingTask1(true);
		setError(null);

		try {
			const result = await submitAnigmaTask1({
				problemId,
				inputFile: file,
				userId: parseInt(session.user.id, 10),
				contestId,
			});

			if (result.error) {
				setError(result.error);
			} else if (result.submissionId) {
				router.push(`/submissions/${result.submissionId}`);
			}
		} catch {
			setError("제출 중 오류가 발생했습니다.");
		} finally {
			setIsSubmittingTask1(false);
		}
	};

	// ANIGMA Task 2: ZIP 파일 제출
	const handleAnigmaTask2Submit = async (file: File) => {
		if (!session?.user?.id) {
			router.push("/login");
			return;
		}

		setIsSubmittingTask2(true);
		setError(null);

		try {
			const result = await submitAnigmaCode({
				problemId,
				zipFile: file,
				userId: parseInt(session.user.id, 10),
				contestId,
			});

			if (result.error) {
				setError(result.error);
			} else if (result.submissionId) {
				router.push(`/submissions/${result.submissionId}`);
			}
		} catch {
			setError("제출 중 오류가 발생했습니다.");
		} finally {
			setIsSubmittingTask2(false);
		}
	};

	if (status === "loading") {
		return (
			<div className="flex items-center justify-center py-12 text-muted-foreground">로딩 중...</div>
		);
	}

	if (!judgeAvailable) {
		return (
			<div className="text-center py-12 bg-yellow-500/5 border border-yellow-200 rounded-md">
				<p className="text-yellow-700 font-medium">이 문제는 현재 제출할 수 없습니다.</p>
				<p className="text-yellow-600/80 text-sm mt-1">
					이 현상이 잘못되었다고 생각될 경우 관리자한테 문의주세요.
				</p>
			</div>
		);
	}

	if (!session?.user) {
		return (
			<div className="text-center py-12">
				<p className="text-muted-foreground mb-4">코드를 제출하려면 로그인이 필요합니다.</p>
				<Button asChild>
					<Link href="/login">로그인</Link>
				</Button>
			</div>
		);
	}

	// ANIGMA 문제: Task 1과 Task 2 분리 표시
	if (problemType === "anigma") {
		return (
			<div className="space-y-6">
				{error && (
					<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
				)}

				{/* Task 1: 입력 생성 */}
				<Card className="border-purple-200 dark:border-purple-900">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg flex items-center gap-2">
							<span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded text-sm font-medium">
								Task 1
							</span>
							결함 입력 (30점)
						</CardTitle>
						{/* <CardDescription>A와 B의 출력이 다른 입력 파일을 찾아 제출하세요.</CardDescription> */}
					</CardHeader>
					<CardContent>
						<AnigmaTask1Submit
							onSubmit={handleAnigmaTask1Submit}
							isSubmitting={isSubmittingTask1}
						/>
					</CardContent>
				</Card>

				{/* Task 2: 코드 수정 */}
				<Card className="border-purple-200 dark:border-purple-900">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg flex items-center gap-2">
							<span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded text-sm font-medium">
								Task 2
							</span>
							코드 수정 (70점)
						</CardTitle>
						{/* <CardDescription>
							테스트케이스를 통과하도록 코드를 수정하여 ZIP 파일로 제출하세요.
						</CardDescription> */}
					</CardHeader>
					<CardContent>
						<AnigmaSubmit onSubmit={handleAnigmaTask2Submit} isSubmitting={isSubmittingTask2} />
					</CardContent>
				</Card>
			</div>
		);
	}

	// 일반 문제: 기존 코드 제출
	return (
		<div className="space-y-4">
			{error && (
				<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
			)}

			<CodeSubmit
				onSubmit={handleSubmit}
				isSubmitting={isSubmitting}
				allowedLanguages={allowedLanguages}
			/>
		</div>
	);
}
