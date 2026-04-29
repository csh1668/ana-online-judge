import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listAdminSubmissionsAction } from "@/actions/admin/submissions";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import {
	type AdminSubmissionsSort,
	parseAdminSubmissionFilter,
} from "@/lib/services/admin-submissions";
import { AdminSubmissionsTable } from "./_components/admin-submissions-table";
import { AdminSubmissionsToolbar } from "./_components/admin-submissions-toolbar";
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
		sort?: AdminSubmissionsSort;
		order?: "asc" | "desc";
	}>;
}) {
	const params = await searchParams;
	const page = Number.parseInt(params.page ?? "1", 10);
	const filter = parseAdminSubmissionFilter(params);

	const { submissions, total } = await listAdminSubmissionsAction(
		filter,
		{ page, limit: 50 },
		{ key: params.sort ?? "createdAt", order: params.order ?? "desc" }
	);
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
			"sort",
			"order",
		] as const) {
			if (params[k]) sp.set(k, params[k] as string);
		}
		return `/admin/submissions?${sp.toString()}`;
	};

	return (
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "제출" }]} />
			<div>
				<h1 className="text-3xl font-bold">제출 관리</h1>
				<p className="text-muted-foreground mt-2">총 {total}건의 제출</p>
			</div>

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

			{totalPages > 1 && (
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
