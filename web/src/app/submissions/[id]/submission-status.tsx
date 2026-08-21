"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { revalidateProblemAfterAccepted } from "@/actions/submissions";
import { Badge, VERDICT_LABELS } from "@/components/ui/badge";
import type { Verdict } from "@/db/schema";

interface SubmissionStatusProps {
	submissionId: number;
	initialVerdict: string;
	score?: number;
	maxScore?: number;
	useFullJudge?: boolean;
	passedTestcases?: number | null;
	totalTestcases?: number | null;
}

export function SubmissionStatus({
	submissionId,
	initialVerdict,
	score,
	maxScore,
	useFullJudge = false,
	passedTestcases: initialPassed = null,
	totalTestcases: initialTotal = null,
}: SubmissionStatusProps) {
	const router = useRouter();
	const [verdict, setVerdict] = useState(initialVerdict);
	const [currentScore, setScore] = useState(score);
	const [passedTestcases, setPassedTestcases] = useState<number | null>(initialPassed);
	const [totalTestcases, setTotalTestcases] = useState<number | null>(initialTotal);
	const [isJudging, setIsJudging] = useState(
		initialVerdict === "pending" || initialVerdict === "judging"
	);
	// null = 아직 진행률 이벤트 없음(큐 대기 중), 숫자 = 워커가 채점 중(시작 시 0% 수신)
	const [progress, setProgress] = useState<number | null>(null);

	useEffect(() => {
		if (!isJudging) return;

		let isCancelled = false;
		let isCompleted = false;

		// SSE 연결. 접속 직후 서버가 최신 진행률 스냅샷을 보내주므로 페이지 복귀 시
		// 현재 퍼센트가 즉시 표시된다. 전송 오류 시 EventSource가 스스로 재연결하고,
		// 그 사이 채점이 끝났다면 서버가 재연결 즉시 complete를 보낸다.
		const eventSource = new EventSource(`/api/submissions/${submissionId}/stream?t=${Date.now()}`);

		eventSource.addEventListener("progress", (event) => {
			if (isCancelled || isCompleted) return;
			const data = JSON.parse(event.data);
			setProgress(data.percentage);
		});

		eventSource.addEventListener("complete", async () => {
			isCompleted = true;
			eventSource.close();

			try {
				const response = await fetch(`/api/submissions/${submissionId}/status`);
				const data = await response.json();
				if (isCancelled) return;

				setVerdict(data.verdict);
				if (data.score !== undefined) setScore(data.score);
				if (data.passedTestcases !== undefined) setPassedTestcases(data.passedTestcases);
				if (data.totalTestcases !== undefined) setTotalTestcases(data.totalTestcases);
				setIsJudging(false);

				if (data.verdict === "accepted" && typeof data.problemId === "number") {
					try {
						await revalidateProblemAfterAccepted(data.problemId);
					} catch (e) {
						console.error("revalidateProblemAfterAccepted failed", e);
					}
				}

				router.refresh();
			} catch (error) {
				console.error("Error fetching status update:", error);
			}
		});

		// 오류 시 EventSource의 자동 재연결에 맡긴다 (close하면 재연결이 죽는다).

		return () => {
			isCancelled = true;
			eventSource.close();
		};
	}, [submissionId, isJudging, router]);

	const typedVerdict = verdict as Verdict;
	const acceptedLabel = VERDICT_LABELS.accepted.label;
	const partialLabel = VERDICT_LABELS.partial.label;
	const wrongAnswerLabel = VERDICT_LABELS.wrong_answer.label;
	const baseLabel = VERDICT_LABELS[typedVerdict]?.label ?? verdict;

	// 채점 중일 때 진행률 표시
	if (isJudging) {
		const statusText = progress === null ? "채점 대기 중" : `채점 중 (${progress}%)`;

		return (
			<div className="flex flex-col gap-2">
				<Badge variant="verdict" verdict="judging">
					<Loader2 className="mr-1 h-3 w-3 animate-spin" />
					{statusText}
				</Badge>
				{progress !== null && (
					<div className="w-full bg-muted rounded-full h-2">
						<div
							className="h-2 rounded-full bg-[var(--verdict-pending)] transition-[width] duration-300 ease-out"
							style={{ width: `${progress}%` }}
						/>
					</div>
				)}
			</div>
		);
	}

	// 완료된 경우 기존 UI
	let label = baseLabel;
	let displayVerdict = typedVerdict;

	const isFullJudgeOverride =
		useFullJudge &&
		totalTestcases !== null &&
		totalTestcases > 0 &&
		verdict !== "compile_error" &&
		verdict !== "system_error";

	if (isFullJudgeOverride) {
		// 전체 채점: 통과 개수에 따라 verdict/라벨 재해석
		// - passed >= M (서버가 accepted로 판정): 맞았습니다
		// - 0 < passed < M (서버가 wrong_answer 등으로 판정): 부분 점수
		// - passed === 0: 틀렸습니다
		const passed = passedTestcases ?? 0;
		const progressLabel = `(${passed}/${totalTestcases})`;
		if (verdict === "accepted") {
			label = `${acceptedLabel} ${progressLabel}`;
		} else if (passed > 0) {
			displayVerdict = "partial" as Verdict;
			label = `${partialLabel} ${progressLabel}`;
		} else {
			displayVerdict = "wrong_answer" as Verdict;
			label = `${wrongAnswerLabel} ${progressLabel}`;
		}
	} else if (verdict === "partial" && currentScore !== undefined) {
		label = `${acceptedLabel} (${currentScore}점)`;
	} else if (verdict === "accepted" && currentScore !== undefined) {
		if (maxScore !== undefined && currentScore !== maxScore) {
			label = `${baseLabel} (${currentScore}점)`;
		}
	}

	return (
		<div className="inline-flex items-center gap-2">
			<Badge variant="verdict" verdict={displayVerdict}>
				{label}
			</Badge>
		</div>
	);
}
