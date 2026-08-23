import type { Metadata } from "next";
import { getJudgeQueueStatus } from "@/actions/judge-status";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { type MockMode, StatusClient } from "./status-client";

export const metadata: Metadata = {
	title: "채점 서버 상태",
	description: "채점 워커 가동 현황 및 우선순위별 대기열 상태",
};

export default async function StatusPage({
	searchParams,
}: {
	searchParams: Promise<{ mock?: string }>;
}) {
	// 시각 확인용 목 모드: ?mock=true(가동 중 데이터) / ?mock=off(꺼짐 상태).
	// 목 모드에서는 Redis를 아예 조회하지 않고 클라이언트가 가짜 데이터를 생성한다.
	const { mock } = await searchParams;
	const mockMode: MockMode = mock === "true" ? "online" : mock === "off" ? "offline" : null;

	const initialStatus = mockMode ? null : await getJudgeQueueStatus();

	return (
		<div className="page-container space-y-4 py-8">
			<PageBreadcrumb items={[{ label: "상태" }]} />
			<StatusClient initialStatus={initialStatus} mockMode={mockMode} />
		</div>
	);
}
