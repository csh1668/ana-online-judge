/**
 * 문제 리스트 sortKey의 단일 source of truth.
 *
 * `ProblemListTable`이 `SortableHeader`로 방출하는 모든 sortKey 값을 여기서 정의한다.
 * 서버 함수(getProblems, listProblemsByTier, listProblemsByTag)와 페이지 whitelist는
 * 이 상수를 파생하거나 확장해서 사용해야 한다. 그래야 테이블 헤더에서 발생한
 * sortKey가 서버에 도달하지 않고 조용히 default로 폴백되는 스펙 드리프트가
 * 컴파일/리뷰 시점에 잡힌다.
 *
 * 확장 키(createdAt, acceptedCount 등)를 추가할 땐 `[...PROBLEM_TABLE_SORT_KEYS, "extra"]`
 * 패턴을 사용해 기본 키 집합을 포함하도록 한다.
 */
export const PROBLEM_TABLE_SORT_KEYS = [
	"id",
	"title",
	"submissionCount",
	"solverCount",
	"acceptRate",
] as const;

export type ProblemTableSort = (typeof PROBLEM_TABLE_SORT_KEYS)[number];

export type SortOrder = "asc" | "desc";
