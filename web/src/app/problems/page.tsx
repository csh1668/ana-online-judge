import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getProblems } from "@/actions/problems";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ProblemAvailabilityToggle } from "@/components/problems/problem-availability-toggle";
import { ProblemFilterTabs } from "@/components/problems/problem-filter-tabs";
import { ProblemListTable } from "@/components/problems/problem-list-table";
import { ProblemSearch } from "@/components/problems/problem-search";
import { SourcesFilterButton } from "@/components/problems/sources-filter-button";
import { SourcePath } from "@/components/sources/source-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getBreadcrumb } from "@/lib/services/sources";

export const metadata: Metadata = {
	title: "문제 목록",
	description: "풀어볼 수 있는 문제들을 확인하세요",
};

type Sort = "id" | "title" | "createdAt" | "acceptRate" | "submissionCount";
type Filter = "all" | "unsolved" | "solved" | "wrong" | "new";

export default async function ProblemsPage({
	searchParams,
}: {
	searchParams: Promise<{
		page?: string;
		search?: string;
		sort?: Sort;
		order?: "asc" | "desc";
		filter?: Filter;
		includeUnavailable?: string;
		sourceId?: string;
	}>;
}) {
	const params = await searchParams;
	const session = await auth();
	const userId = session?.user?.id ? parseInt(session.user.id, 10) : undefined;

	const page = parseInt(params.page || "1", 10);
	const filter = params.filter || "all";
	const includeUnavailable = params.includeUnavailable === "1";
	const sourceId = params.sourceId ? parseInt(params.sourceId, 10) : undefined;

	const { problems, total } = await getProblems({
		page,
		limit: 20,
		search: params.search,
		sort: params.sort,
		order: params.order,
		filter,
		userId,
		includeUnavailable,
		sourceId,
	});
	const sourceBreadcrumb = sourceId !== undefined ? await getBreadcrumb(sourceId) : null;
	const totalPages = Math.ceil(total / 20);

	const userProblemStatuses = userId
		? await getUserProblemStatuses(
				problems.map((p) => p.id),
				userId
			)
		: new Map<number, { solved: boolean; score: number | null }>();

	const buildPageUrl = (targetPage: number) => {
		const p = new URLSearchParams();
		p.set("page", String(targetPage));
		if (params.search) p.set("search", params.search);
		if (params.sort) p.set("sort", params.sort);
		if (params.order) p.set("order", params.order);
		if (params.filter) p.set("filter", params.filter);
		if (params.includeUnavailable) p.set("includeUnavailable", params.includeUnavailable);
		if (params.sourceId) p.set("sourceId", params.sourceId);
		return `/problems?${p.toString()}`;
	};

	const clearSourceUrl = (() => {
		const p = new URLSearchParams();
		if (params.search) p.set("search", params.search);
		if (params.sort) p.set("sort", params.sort);
		if (params.order) p.set("order", params.order);
		if (params.filter) p.set("filter", params.filter);
		if (params.includeUnavailable) p.set("includeUnavailable", params.includeUnavailable);
		const qs = p.toString();
		return qs ? `/problems?${qs}` : "/problems";
	})();

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "문제" }]} />
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
					<CardTitle className="text-2xl">문제 목록</CardTitle>
					<Suspense>
						<ProblemSearch />
					</Suspense>
				</CardHeader>
				<CardContent>
					<div className="mb-4 flex items-center justify-between gap-2">
						<Suspense>
							<ProblemFilterTabs isLoggedIn={!!userId} />
						</Suspense>
						<div className="flex items-center gap-2">
							<Suspense>
								<SourcesFilterButton />
							</Suspense>
							<Suspense>
								<ProblemAvailabilityToggle />
							</Suspense>
						</div>
					</div>

					{sourceBreadcrumb && sourceBreadcrumb.length > 0 && (
						<div className="mb-4 flex items-center gap-2 rounded border bg-accent/30 p-2 text-sm">
							<span className="text-muted-foreground">출처 필터:</span>
							<SourcePath segments={sourceBreadcrumb} variant="emphasized" />
							<Link href={clearSourceUrl} className="ml-auto text-muted-foreground hover:underline">
								해제
							</Link>
						</div>
					)}

					<ProblemListTable
						problems={problems}
						userProblemStatuses={userProblemStatuses}
						sortable
						emptyLabel={
							filter !== "all" && filter !== "new"
								? "조건에 맞는 문제가 없습니다."
								: "등록된 문제가 없습니다."
						}
					/>

					{problems.length > 0 && (
						<PaginationLinks currentPage={page} totalPages={totalPages} buildHref={buildPageUrl} />
					)}
				</CardContent>
			</Card>
		</div>
	);
}
