/**
 * 채점 우선순위 SSOT — 레벨 집합은 이 파일에서만 정의된다.
 * judge(Rust)는 레벨 목록을 모르며 judge:queue:p* 키스페이스를 SCAN으로 자동 발견한다.
 * 레벨 추가/삭제는 이 파일 + push 호출부만 수정하면 되고 judge 재배포가 필요 없다.
 */
export const JUDGE_PRIORITY_LEVELS = [-2, -1, 0, 1, 2] as const;
export type JudgePriority = (typeof JUDGE_PRIORITY_LEVELS)[number];
export const SYSTEM_JOB_PRIORITY: JudgePriority = -2; // workshop·validate·재채점
export const JUDGE_PRIORITY_LABELS: Record<JudgePriority, string> = {
	2: "매우 높음 (+2)",
	1: "높음 (+1)",
	0: "보통 (0)",
	[-1]: "낮음 (-1)",
	[-2]: "매우 낮음 (-2)",
};
export function queueKeyFor(priority: JudgePriority): string {
	return `judge:queue:p${priority}`;
}
