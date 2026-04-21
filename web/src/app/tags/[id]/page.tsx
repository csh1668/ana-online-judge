import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ProblemListTable } from "@/components/problems/problem-list-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getTag, listChildren } from "@/lib/services/algorithm-tags";
import {
	listProblemsByTag,
	PROBLEM_BY_TAG_SORT_KEYS,
	type ProblemByTagSort,
} from "@/lib/services/problem-vote-tags";

interface Props {
	params: Promise<{ id: string }>;
	searchParams: Promise<{
		sort?: string;
		order?: string;
		page?: string;
	}>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const tag = await getTag(parseInt(id, 10));
	return {
		title: tag ? `${tag.name} — 알고리즘 태그` : "태그 없음",
	};
}

export default async function TagDetailPage({ params, searchParams }: Props) {
	const { id } = await params;
	const tagId = parseInt(id, 10);
	if (Number.isNaN(tagId)) notFound();

	const tag = await getTag(tagId);
	if (!tag) notFound();

	const sp = await searchParams;
	const sort = (PROBLEM_BY_TAG_SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
		? (sp.sort as ProblemByTagSort)
		: "solverCount";
	const order: "asc" | "desc" = sp.order === "asc" ? "asc" : "desc";
	const page = Math.max(1, parseInt(sp.page ?? "1", 10));
	const limit = 100;

	const session = await auth();
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	const [children, { problems, total }] = await Promise.all([
		listChildren(tagId),
		listProblemsByTag(tagId, { sort, order, page, limit }),
	]);

	const userStatuses = currentUserId
		? await getUserProblemStatuses(
				problems.map((p) => p.id),
				currentUserId
			)
		: new Map<number, { solved: boolean; score: number | null }>();

	const totalPages = Math.max(1, Math.ceil(total / limit));

	function buildHref(p: number) {
		const next = new URLSearchParams();
		if (sort !== "solverCount") next.set("sort", sort);
		if (order !== "desc") next.set("order", order);
		if (p !== 1) next.set("page", String(p));
		const qs = next.toString();
		return qs ? `/tags/${tagId}?${qs}` : `/tags/${tagId}`;
	}

	const breadcrumbItems = [{ label: "알고리즘 분류", href: "/tags" }, { label: tag.name }];

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={breadcrumbItems} />
			<Card>
				<CardHeader className="space-y-2 pb-6">
					<CardTitle className="text-2xl">{tag.name}</CardTitle>
					{tag.description && (
						<div className="text-sm text-muted-foreground">
							<MarkdownRenderer content={tag.description} />
						</div>
					)}
				</CardHeader>
				<CardContent className="space-y-4">
					{children.length > 0 && (
						<div className="space-y-2">
							<h2 className="text-sm font-semibold text-muted-foreground">하위 태그</h2>
							<div className="flex flex-wrap gap-1">
								{children.map((c) => (
									<Link
										key={c.id}
										href={`/tags/${c.id}`}
										className="inline-flex items-center rounded-md border px-2 py-0.5 text-sm hover:bg-muted"
									>
										{c.name}
									</Link>
								))}
							</div>
						</div>
					)}

					<div>
						<h2 className="text-lg font-semibold mb-2">문제 ({total})</h2>
						<ProblemListTable
							problems={problems}
							userProblemStatuses={userStatuses}
							sortable
							emptyLabel="이 태그를 가진 문제가 없습니다."
						/>
						{problems.length > 0 && (
							<PaginationLinks currentPage={page} totalPages={totalPages} buildHref={buildHref} />
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
