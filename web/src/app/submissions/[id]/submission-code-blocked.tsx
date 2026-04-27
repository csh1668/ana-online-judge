import { Lock } from "lucide-react";
import type { CodeAccessDeniedReason } from "@/lib/submission-access";

const MESSAGES: Record<CodeAccessDeniedReason, string> = {
	contest_running: "대회 진행 중에는 다른 사용자의 제출을 볼 수 없어요.",
	contest_submission: "대회 제출은 다른 사용자에게 공개되지 않아요.",
	anonymous: "로그인하면 다른 사용자의 공개 풀이를 볼 수 있어요.",
	not_solved: "이 문제를 풀어야 다른 사용자의 공개 풀이를 볼 수 있어요.",
	private: "제출자가 비공개로 설정한 제출이에요.",
	not_yet_ac: "제출자가 '맞았을 경우 공개'로 설정했지만 이 제출은 아직 만점이 아니에요.",
	judging: "채점이 진행 중이에요. 채점 결과에 따라 공개 여부가 결정돼요.",
};

export function SubmissionCodeBlocked({ reason }: { reason: CodeAccessDeniedReason }) {
	return (
		<div className="rounded-md border bg-muted/20 p-8 flex flex-col items-center justify-center gap-3 text-center">
			<Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
			<p className="text-sm text-muted-foreground max-w-md">{MESSAGES[reason]}</p>
		</div>
	);
}
