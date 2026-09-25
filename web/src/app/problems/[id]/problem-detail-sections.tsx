import type { ReactNode } from "react";

/** 단일/분할 모드가 공유하는 섹션 엘리먼트. 부모(ProblemDetailClient)가 한 번 만들어 내린다. */
export interface ProblemDetailSections {
	submit: ReactNode;
	mySubmissions: ReactNode;
	ranking: ReactNode;
	vote: ReactNode;
	allSubmissions: ReactNode;
	rejudge: ReactNode;
}
