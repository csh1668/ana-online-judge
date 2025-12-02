"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface SubmissionStatusProps {
	submissionId: number;
	initialVerdict: string;
}

const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
	pending: { label: "대기 중", color: "bg-gray-500" },
	judging: { label: "채점 중", color: "bg-blue-500" },
	accepted: { label: "정답", color: "bg-emerald-500" },
	wrong_answer: { label: "오답", color: "bg-rose-500" },
	time_limit_exceeded: { label: "시간 초과", color: "bg-amber-500" },
	memory_limit_exceeded: { label: "메모리 초과", color: "bg-orange-500" },
	runtime_error: { label: "런타임 에러", color: "bg-purple-500" },
	compile_error: { label: "컴파일 에러", color: "bg-pink-500" },
	system_error: { label: "시스템 에러", color: "bg-red-500" },
};

export function SubmissionStatus({ submissionId, initialVerdict }: SubmissionStatusProps) {
	const router = useRouter();
	const [verdict, setVerdict] = useState(initialVerdict);
	const [isPolling, setIsPolling] = useState(
		initialVerdict === "pending" || initialVerdict === "judging"
	);

	useEffect(() => {
		if (!isPolling) return;

		const poll = async () => {
			try {
				const response = await fetch(`/api/submissions/${submissionId}/status`);
				const data = await response.json();

				if (data.isComplete) {
					setVerdict(data.verdict);
					setIsPolling(false);
					router.refresh();
				} else {
					setVerdict(data.verdict);
				}
			} catch (error) {
				console.error("Polling error:", error);
			}
		};

		const interval = setInterval(poll, 2000);
		return () => clearInterval(interval);
	}, [submissionId, isPolling, router]);

	const verdictInfo = VERDICT_LABELS[verdict] || { label: verdict, color: "bg-gray-500" };

	return (
		<Badge className={`${verdictInfo.color} hover:${verdictInfo.color}`}>
			{isPolling && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
			{verdictInfo.label}
		</Badge>
	);
}
