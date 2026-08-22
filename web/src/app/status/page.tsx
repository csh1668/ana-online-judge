import type { Metadata } from "next";
import { getJudgeQueueStatus } from "@/actions/judge-status";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { StatusClient } from "./status-client";

export const metadata: Metadata = {
	title: "채점 서버 상태",
	description: "채점 워커 가동 현황 및 우선순위별 대기열 상태",
};

export default async function StatusPage() {
	const initialStatus = await getJudgeQueueStatus();

	return (
		<div className="page-container space-y-4 py-8">
			<PageBreadcrumb items={[{ label: "상태" }]} />
			<StatusClient initialStatus={initialStatus} />
		</div>
	);
}
