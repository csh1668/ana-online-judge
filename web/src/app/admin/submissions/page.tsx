import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { countDeadLetterJobsAction, listDeadLetterJobsAction } from "@/actions/admin/dlq";
import {
	listAdminSubmissionsAction,
	parseAdminSubmissionFilter,
} from "@/actions/admin/submissions";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminSubmissionsSort } from "@/lib/services/admin-submissions";
import { cn } from "@/lib/utils";
import { AdminSubmissionsTable } from "./_components/admin-submissions-table";
import { AdminSubmissionsToolbar } from "./_components/admin-submissions-toolbar";
import { DeadLetterTable } from "./_components/dead-letter-table";
import { RejudgeShell } from "./_components/rejudge-shell";
import { SelectionProvider } from "./_components/selection-context";

export const metadata: Metadata = {
	title: "제출 관리",
};

export default async function AdminSubmissionsPage({
	searchParams,
}: {
	searchParams: Promise<{
		page?: string;
		userIds?: string;
		problemId?: string;
		contestId?: string;
		verdicts?: string;
		languages?: string;
		dateFrom?: string;
		dateTo?: string;
		visibility?: string;
		rejudgeBatch?: string;
		phase?: string;
		verdict?: string;
		sort?: AdminSubmissionsSort;
		order?: "asc" | "desc";
		tab?: string;
	}>;
}) {
	const params = await searchParams;
	const isDlqTab = params.tab === "dlq";
	const page = Number.parseInt(params.page ?? "1", 10);
	const filter = await parseAdminSubmissionFilter(params);

	const [{ submissions, total }, dlqCount, dlqEntries] = await Promise.all([
		listAdminSubmissionsAction(
			filter,
			{ page, limit: 50 },
			{ key: params.sort ?? "createdAt", order: params.order ?? "desc" }
		),
		countDeadLetterJobsAction(),
		isDlqTab ? listDeadLetterJobsAction() : Promise.resolve(null),
	]);
	const totalPages = Math.ceil(total / 50);

	const buildPageHref = (target: number) => {
		const sp = new URLSearchParams();
		sp.set("page", String(target));
		for (const k of [
			"userIds",
			"problemId",
			"contestId",
			"verdicts",
			"languages",
			"dateFrom",
			"dateTo",
			"visibility",
			"rejudgeBatch",
			"phase",
			"verdict",
			"sort",
			"order",
		] as const) {
			if (params[k]) sp.set(k, params[k] as string);
		}
		return `/admin/submissions?${sp.toString()}`;
	};

	// URL 파라미터 기반 서버 렌더 탭 — 디자인 시스템의 Tabs(underline) 스타일을 Link로 재현
	const tabLinkClass = (active: boolean) =>
		cn(
			"inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium -mb-px border-b-[3px] transition-colors",
			active
				? "border-primary text-foreground font-semibold"
				: "border-transparent text-muted-foreground hover:text-foreground"
		);

	return (
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "제출" }]} />
			<div>
				<h1 className="text-3xl font-bold">제출 관리</h1>
				<p className="text-muted-foreground mt-2">
					{isDlqTab ? `Dead Letter ${dlqCount}건` : `총 ${total}건의 제출`}
				</p>
			</div>

			<div className="flex items-stretch w-full border-b border-border">
				<Link href="/admin/submissions" className={tabLinkClass(!isDlqTab)}>
					제출 목록
				</Link>
				<Link href="/admin/submissions?tab=dlq" className={tabLinkClass(isDlqTab)}>
					Dead Letter{dlqCount > 0 ? ` (${dlqCount})` : ""}
				</Link>
			</div>

			{isDlqTab ? (
				<Card>
					<CardContent className="p-0">
						<DeadLetterTable entries={dlqEntries ?? []} />
					</CardContent>
				</Card>
			) : (
				<>
					<Suspense>
						<AdminSubmissionsToolbar />
					</Suspense>

					<SelectionProvider>
						<RejudgeShell pageRowsCount={submissions.length} totalCount={total} filter={filter} />
						<Card>
							<CardContent className="p-0">
								{submissions.length === 0 ? (
									<div className="text-center py-12 text-muted-foreground">
										조건에 맞는 제출이 없습니다.
									</div>
								) : (
									<AdminSubmissionsTable rows={submissions} />
								)}
							</CardContent>
						</Card>
					</SelectionProvider>
				</>
			)}

			{!isDlqTab && totalPages > 1 && (
				<div className="flex items-center justify-center gap-2">
					{page > 1 && (
						<Link
							href={buildPageHref(page - 1)}
							className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
						>
							이전
						</Link>
					)}
					<span className="text-sm text-muted-foreground">
						{page} / {totalPages}
					</span>
					{page < totalPages && (
						<Link
							href={buildPageHref(page + 1)}
							className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
						>
							다음
						</Link>
					)}
				</div>
			)}
		</div>
	);
}
