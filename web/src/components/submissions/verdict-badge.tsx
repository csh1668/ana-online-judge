import { Badge } from "@/components/ui/badge";
import type { Verdict } from "@/db/schema";

// export const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
export const VERDICT_LABELS: Record<Verdict, { label: string; color: string }> = {
	pending: { label: "대기 중", color: "bg-gray-500" },
	judging: { label: "채점 중", color: "bg-blue-500" },
	accepted: { label: "정답", color: "bg-emerald-500" },
	wrong_answer: { label: "오답", color: "bg-rose-500" },
	time_limit_exceeded: { label: "시간 초과", color: "bg-amber-500" },
	memory_limit_exceeded: { label: "메모리 초과", color: "bg-orange-500" },
	runtime_error: { label: "런타임 에러", color: "bg-purple-500" },
	compile_error: { label: "컴파일 에러", color: "bg-pink-500" },
	system_error: { label: "시스템 에러", color: "bg-red-500" },
	skipped: { label: "생략됨", color: "bg-slate-500" },
	presentation_error: { label: "출력 형식 에러", color: "bg-yellow-500" },
	fail: { label: "체커 오류", color: "bg-red-700" },
};

interface VerdictBadgeProps {
	verdict: string | Verdict;
}

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
	const verdictInfo = VERDICT_LABELS[verdict as Verdict] ?? {
		label: verdict,
		color: "bg-gray-500",
	};

	return (
		<Badge className={`${verdictInfo.color} hover:${verdictInfo.color}`}>{verdictInfo.label}</Badge>
	);
}
