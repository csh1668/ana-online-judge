import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { TagListTable } from "@/components/tags/tag-list-table";
import { Input } from "@/components/ui/input";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { listAllTagsWithProblemCount } from "@/lib/services/algorithm-tags";

export const metadata: Metadata = {
	title: "알고리즘 분류",
};

interface Props {
	searchParams: Promise<{
		search?: string;
		sort?: string;
		order?: string;
		page?: string;
	}>;
}

export default async function TagsPage({ searchParams }: Props) {
	const params = await searchParams;
	const search = params.search ?? "";
	const sort: "name" | "problemCount" = params.sort === "name" ? "name" : "problemCount";
	const order: "asc" | "desc" = params.order === "asc" ? "asc" : "desc";
	const page = Math.max(1, parseInt(params.page ?? "1", 10));
	const limit = 100;

	const { tags, total } = await listAllTagsWithProblemCount({
		search,
		sortBy: sort,
		order,
		page,
		limit,
	});
	const totalPages = Math.max(1, Math.ceil(total / limit));

	function buildHref(p: number) {
		const sp = new URLSearchParams();
		if (search) sp.set("search", search);
		if (sort !== "problemCount") sp.set("sort", sort);
		if (order !== "desc") sp.set("order", order);
		if (p !== 1) sp.set("page", String(p));
		const qs = sp.toString();
		return qs ? `/tags?${qs}` : "/tags";
	}

	return (
		<div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "알고리즘 분류" }]} />
			<div>
				<h1 className="text-3xl font-bold">알고리즘 분류</h1>
				<p className="text-sm text-muted-foreground mt-1">총 {total}개</p>
			</div>

			<form method="get" action="/tags">
				<Input
					name="search"
					placeholder="태그 이름 검색"
					defaultValue={search}
					className="max-w-sm"
				/>
				{sort !== "problemCount" && <input type="hidden" name="sort" value={sort} />}
				{order !== "desc" && <input type="hidden" name="order" value={order} />}
			</form>

			<TagListTable tags={tags} />

			<PaginationLinks currentPage={page} totalPages={totalPages} buildHref={buildHref} />
		</div>
	);
}
