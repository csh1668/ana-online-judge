"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { revalidateProblemAfterAccepted } from "@/actions/submissions";
import { Badge, VERDICT_LABELS } from "@/components/ui/badge";
import type { Verdict } from "@/db/schema";

interface SubmissionStatusProps {
	submissionId: number;
	initialVerdict: string;
	score?: number;
	maxScore?: number;
}

export function SubmissionStatus({
	submissionId,
	initialVerdict,
	score,
	maxScore,
}: SubmissionStatusProps) {
	const router = useRouter();
	const [verdict, setVerdict] = useState(initialVerdict);
	const [currentScore, setScore] = useState(score);
	const [isJudging, setIsJudging] = useState(
		initialVerdict === "pending" || initialVerdict === "judging"
	);
	const [displayProgress, setDisplayProgress] = useState(0);
	const [targetProgress, setTargetProgress] = useState(0);
	const animationRef = useRef<number | null>(null);
	const onAnimationComplete = useRef<(() => void) | null>(null);
	const displayProgressRef = useRef(0);

	useEffect(() => {
		displayProgressRef.current = displayProgress;
	}, [displayProgress]);

	// 부드러운 진행률 애니메이션
	useEffect(() => {
		if (displayProgress >= targetProgress) {
			if (displayProgress >= 100 && onAnimationComplete.current) {
				onAnimationComplete.current();
				onAnimationComplete.current = null;
			}
			return;
		}

		const interval = 10; // 10ms 간격으로 1%씩 증가

		const timer = setInterval(() => {
			setDisplayProgress((prev) => {
				if (prev < targetProgress) {
					return prev + 1;
				}
				clearInterval(timer);
				return prev;
			});
		}, interval);

		return () => clearInterval(timer);
	}, [targetProgress, displayProgress]);

	useEffect(() => {
		if (!isJudging) return;

		let isCancelled = false;
		let isCompleted = false;
		let eventSource: EventSource | null = null;

		const checkStatusAndConnect = () => {
			if (isCancelled) return;

			// Connect to SSE stream (add timestamp to prevent caching)
			const timestamp = Date.now();
			eventSource = new EventSource(`/api/submissions/${submissionId}/stream?t=${timestamp}`);

			eventSource.addEventListener("progress", (event) => {
				if (!isCancelled) {
					const data = JSON.parse(event.data);
					setTargetProgress(data.percentage);
				}
			});

			eventSource.addEventListener("complete", async () => {
				isCompleted = true;
				if (eventSource) {
					eventSource.close();
				}

				// Fetch updated status from API
				try {
					const response = await fetch(`/api/submissions/${submissionId}/status`);
					const data = await response.json();

					if (!isCancelled) {
						// Set progress to 100% and wait for animation to actually reach 100%
						setTargetProgress(100);
						await new Promise<void>((resolve) => {
							if (displayProgressRef.current >= 100) {
								resolve();
							} else {
								onAnimationComplete.current = resolve;
							}
						});

						setVerdict(data.verdict);
						if (data.score !== undefined) {
							setScore(data.score);
						}
						setIsJudging(false);

						// Broadcast result so other components (e.g. MySubmissions) can update
						window.dispatchEvent(
							new CustomEvent("submission-judged", {
								detail: {
									id: submissionId,
									verdict: data.verdict,
									score: data.score,
									executionTime: data.executionTime,
									memoryUsed: data.memoryUsed,
								},
							})
						);

						if (data.verdict === "accepted" && typeof data.problemId === "number") {
							try {
								await revalidateProblemAfterAccepted(data.problemId);
							} catch (e) {
								console.error("revalidateProblemAfterAccepted failed", e);
							}
						}

						router.refresh();
					}
				} catch (error) {
					console.error("Error fetching status update:", error);
				}
			});

			eventSource.onerror = () => {
				if (eventSource) {
					eventSource.close();
				}
				if (!isCompleted && !isCancelled) {
					setIsJudging(false);
				}
			};
		};

		checkStatusAndConnect();

		// Cleanup on unmount
		return () => {
			isCancelled = true;
			if (eventSource) {
				eventSource.close();
			}
			if (animationRef.current) {
				clearInterval(animationRef.current);
				animationRef.current = null;
			}
		};
	}, [submissionId, isJudging, router]);

	const typedVerdict = verdict as Verdict;
	const baseLabel = VERDICT_LABELS[typedVerdict]?.label ?? verdict;

	// 채점 중일 때 진행률 표시
	if (isJudging) {
		const statusText = displayProgress === 0 ? "채점 준비 중" : `채점 중 (${displayProgress}%)`;

		return (
			<div className="flex flex-col gap-2">
				<Badge variant="verdict" verdict="judging">
					<Loader2 className="mr-1 h-3 w-3 animate-spin" />
					{statusText}
				</Badge>
				{displayProgress > 0 && (
					<div className="w-full bg-muted rounded-full h-2">
						<div
							className="h-2 rounded-full transition-all bg-[var(--verdict-pending)]"
							style={{ width: `${displayProgress}%` }}
						/>
					</div>
				)}
			</div>
		);
	}

	// 완료된 경우 기존 UI
	let label = baseLabel;
	if (verdict === "partial" && currentScore !== undefined) {
		label = `${baseLabel} (${currentScore}점)`;
	} else if (verdict === "accepted" && currentScore !== undefined) {
		// max_score가 100이 아니거나, 받은 점수가 max_score가 아니면 점수 표시
		if (maxScore !== undefined && (maxScore !== 100 || currentScore !== maxScore)) {
			label = `${baseLabel} (${currentScore}점)`;
		}
	}

	return (
		<Badge variant="verdict" verdict={typedVerdict}>
			{label}
		</Badge>
	);
}
