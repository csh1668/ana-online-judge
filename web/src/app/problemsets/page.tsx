import type { Metadata } from "next";
import Link from "next/link";
import { getProblemSets } from "@/actions/problem-sets";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { ProblemSetFilterTabs } from "@/components/problem-sets/problem-set-filter-tabs";
import { ProblemSetListTable } from "@/components/problem-sets/problem-set-list-table";
import { ProblemSetSearchInput } from "@/components/problem-sets/problem-set-search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { PROBLEM_SET_LIST_PAGE_SIZE } from "@/lib/problem-set-constants";
import {
	type ListFilter,
	type ListSort,
	PROBLEM_SET_SORT_KEYS,
	type SortOrder,
} from "@/lib/services/problem-sets";

export const metadata: Metadata = {
	title: "문제집",
	description: "사용자가 만든 문제 모음을 둘러보세요",
};

const VALID_FILTERS: ListFilter[] = ["all", "liked", "mine"];
const DEFAULT_SORT: ListSort = "likes";
const DEFAULT_ORDER: SortOrder = "desc";

export default async function ProblemSetsPage({
	searchParams,
}: {
	searchParams: Promise<{
		page?: string;
		sort?: string;
		order?: string;
		filter?: string;
		q?: string;
	}>;
}) {
	const sp = await searchParams;
	const session = await auth();
	const viewerId = session?.user?.id ? Number.parseInt(session.user.id, 10) : undefined;
	const isLoggedIn = !!viewerId;

	const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
	const sort: ListSort = (PROBLEM_SET_SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
		? (sp.sort as ListSort)
		: DEFAULT_SORT;
	const order: SortOrder = sp.order === "asc" ? "asc" : "desc";
	const filter: ListFilter = (VALID_FILTERS as string[]).includes(sp.filter ?? "")
		? (sp.filter as ListFilter)
		: "all";

	const { items, total } = await getProblemSets({
		page,
		sort,
		order,
		filter,
		q: sp.q,
	});
	const totalPages = Math.max(1, Math.ceil(total / PROBLEM_SET_LIST_PAGE_SIZE));

	const buildHref = (p: number) => {
		const params = new URLSearchParams();
		if (sp.q) params.set("q", sp.q);
		if (sort !== DEFAULT_SORT || order !== DEFAULT_ORDER) {
			params.set("sort", sort);
			params.set("order", order);
		}
		if (filter !== "all") params.set("filter", filter);
		if (p !== 1) params.set("page", String(p));
		const qs = params.toString();
		return qs ? `/problemsets?${qs}` : "/problemsets";
	};

	return (
		<PageShell breadcrumb={[{ label: "문제집" }]}>
			<Card>
				<PageHeader
					title="문제집 목록"
					actions={
						isLoggedIn && (
							<Button asChild>
								<Link href="/problemsets/new">새 문제집</Link>
							</Button>
						)
					}
				/>
				<CardContent>
					<div className="mb-4 flex flex-wrap items-center gap-3 justify-between">
						<ProblemSetFilterTabs isLoggedIn={isLoggedIn} />
						<ProblemSetSearchInput />
					</div>
					<ProblemSetListTable items={items} isLoggedIn={isLoggedIn} />
					{items.length > 0 && (
						<PaginationLinks currentPage={page} totalPages={totalPages} buildHref={buildHref} />
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
