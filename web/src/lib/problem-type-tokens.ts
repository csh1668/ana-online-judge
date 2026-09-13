import type { ProblemType } from "@/db/schema";

/**
 * 문제 유형 토큰 목록 — `^<유형>` 접두사 검색에서 사용되는 유효한 유형 값.
 * services 계층과 컴포넌트 계층 양쪽에서 참조하는 순수 상수이므로 lib/ 에 배치.
 */
export const PROBLEM_TYPE_TOKENS: { token: string; value: ProblemType; label: string }[] = [
	{ token: "icpc", value: "icpc", label: "ICPC" },
	{ token: "special_judge", value: "special_judge", label: "스페셜 저지" },
	{ token: "anigma", value: "anigma", label: "ANIGMA" },
	{ token: "interactive", value: "interactive", label: "인터랙티브" },
	{ token: "two_step", value: "two_step", label: "투스탭" },
];
