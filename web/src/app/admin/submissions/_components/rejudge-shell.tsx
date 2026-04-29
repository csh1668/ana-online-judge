"use client";

import type { AdminSubmissionFilter } from "@/lib/services/admin-submissions";
import { RejudgeBar } from "./rejudge-bar";

export function RejudgeShell({
	pageRowsCount,
	totalCount,
}: {
	pageRowsCount: number;
	totalCount: number;
	filter: AdminSubmissionFilter;
}) {
	return (
		<RejudgeBar
			pageRowsCount={pageRowsCount}
			totalCount={totalCount}
			onOpenSelectedDialog={() => {}}
			onOpenFilterDialog={() => {}}
		/>
	);
}
