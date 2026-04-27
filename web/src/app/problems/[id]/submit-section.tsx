"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { submitAnigmaCode, submitAnigmaTask1 } from "@/actions/anigma-submissions";
import { submitCode } from "@/actions/submissions";
import { AnigmaSubmit } from "@/components/problems/anigma-submit";
import { AnigmaTask1Submit } from "@/components/problems/anigma-task1-submit";
import { CodeSubmit } from "@/components/problems/code-submit";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Language, ProblemType } from "@/db/schema";

interface ProblemSubmitSectionProps {
	problemId: number;
	problemType: ProblemType;
	judgeAvailable?: boolean;
	allowedLanguages?: string[] | null;
	contestId?: number;
	onSubmitSuccess?: (submissionId: number, language: string, codeLength: number) => void;
}

async function issueTurnstileTicket(token: string): Promise<boolean> {
	try {
		const res = await fetch("/api/auth/turnstile-ticket", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token }),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export function ProblemSubmitSection({
	problemId,
	problemType,
	judgeAvailable = true,
	allowedLanguages,
	contestId,
	onSubmitSuccess,
}: ProblemSubmitSectionProps) {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [isSubmittingTask1, setIsSubmittingTask1] = useState(false);
	const [isSubmittingTask2, setIsSubmittingTask2] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const captchaRef = useRef<TurnstileWidgetHandle>(null);
	const ticketReadyResolversRef = useRef<Array<() => void>>([]);

	const onCaptchaVerify = useCallback(async (token: string) => {
		const ok = await issueTurnstileTicket(token);
		if (ok) {
			const resolvers = ticketReadyResolversRef.current;
			ticketReadyResolversRef.current = [];
			for (const r of resolvers) r();
		}
	}, []);

	useEffect(() => {
		return () => {
			ticketReadyResolversRef.current = [];
		};
	}, []);

	function requestTicketRefresh(): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				ticketReadyResolversRef.current = ticketReadyResolversRef.current.filter(
					(r) => r !== wrapped
				);
				reject(new Error("CAPTCHA 재검증이 시간 초과되었습니다."));
			}, 30000);
			const wrapped = () => {
				clearTimeout(timeoutId);
				resolve();
			};
			ticketReadyResolversRef.current.push(wrapped);
			captchaRef.current?.reset();
		});
	}

	const handleSubmit = async (code: string, language: Language) => {
		if (!session?.user?.id) {
			router.push("/login");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const payload = {
				problemId,
				code,
				language,
				contestId,
			};
			let result = await submitCode(payload);

			if (result.needsCaptcha) {
				try {
					await requestTicketRefresh();
					result = await submitCode(payload);
				} catch (e) {
					setError(e instanceof Error ? e.message : "CAPTCHA 검증에 실패했습니다.");
					return;
				}
			}

			if (result.error) {
				setError(result.error);
			} else if (result.submissionId) {
				if (onSubmitSuccess) {
					const codeLength = new TextEncoder().encode(code).byteLength;
					onSubmitSuccess(result.submissionId, language, codeLength);
				} else {
					router.push(`/submissions/${result.submissionId}`);
				}
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
			const payload = {
				problemId,
				inputFile: file,
				userId: parseInt(session.user.id, 10),
				contestId,
			};
			let result = await submitAnigmaTask1(payload);

			if (result.needsCaptcha) {
				try {
					await requestTicketRefresh();
					result = await submitAnigmaTask1(payload);
				} catch (e) {
					setError(e instanceof Error ? e.message : "CAPTCHA 검증에 실패했습니다.");
					return;
				}
			}

			if (result.error) {
				setError(result.error);
			} else if (result.submissionId) {
				if (onSubmitSuccess) {
					onSubmitSuccess(result.submissionId, "anigma", file.size);
				} else {
					router.push(`/submissions/${result.submissionId}`);
				}
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
			const payload = {
				problemId,
				zipFile: file,
				userId: parseInt(session.user.id, 10),
				contestId,
			};
			let result = await submitAnigmaCode(payload);

			if (result.needsCaptcha) {
				try {
					await requestTicketRefresh();
					result = await submitAnigmaCode(payload);
				} catch (e) {
					setError(e instanceof Error ? e.message : "CAPTCHA 검증에 실패했습니다.");
					return;
				}
			}

			if (result.error) {
				setError(result.error);
			} else if (result.submissionId) {
				if (onSubmitSuccess) {
					onSubmitSuccess(result.submissionId, "anigma", file.size);
				} else {
					router.push(`/submissions/${result.submissionId}`);
				}
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
			<div className="text-center py-12 bg-[var(--verdict-tle-bg)] border border-[var(--verdict-tle)] rounded-md">
				<p className="text-[var(--verdict-tle)] font-medium">이 문제는 현재 제출할 수 없습니다.</p>
				<p className="text-[var(--verdict-tle)] text-sm mt-1">
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
				<Card className="border-border">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg flex items-center gap-2">
							<span className="bg-secondary text-foreground px-2 py-0.5 rounded text-sm font-medium">
								Task 1
							</span>
							결함 입력 (30점)
						</CardTitle>
					</CardHeader>
					<CardContent>
						<AnigmaTask1Submit
							onSubmit={handleAnigmaTask1Submit}
							isSubmitting={isSubmittingTask1}
						/>
					</CardContent>
				</Card>

				{/* Task 2: 코드 수정 */}
				<Card className="border-border">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg flex items-center gap-2">
							<span className="bg-secondary text-foreground px-2 py-0.5 rounded text-sm font-medium">
								Task 2
							</span>
							코드 수정 (70점)
						</CardTitle>
					</CardHeader>
					<CardContent>
						<AnigmaSubmit onSubmit={handleAnigmaTask2Submit} isSubmitting={isSubmittingTask2} />
					</CardContent>
				</Card>

				<TurnstileWidget
					ref={captchaRef}
					size="invisible"
					appearance="interaction-only"
					onVerify={onCaptchaVerify}
				/>
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

			<TurnstileWidget
				ref={captchaRef}
				size="invisible"
				appearance="interaction-only"
				onVerify={onCaptchaVerify}
			/>
		</div>
	);
}
