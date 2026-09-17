import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserProblemStatuses } from "@/actions/submissions";
import {
	getTag,
	listChildren,
	listProblemsByTag,
	PROBLEM_BY_TAG_SORT_KEYS,
	type ProblemByTagSort,
} from "@/actions/tags";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ProblemListTable } from "@/components/problems/problem-list-table";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";

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
		<PageShell breadcrumb={breadcrumbItems}>
			<Card>
				<PageHeader
					title={tag.name}
					description={tag.description && <MarkdownRenderer content={tag.description} />}
				/>
				<CardContent className="space-y-4">
					{children.length > 0 && (
						<div className="space-y-2">
							<h2 className="text-sm font-semibold text-muted-foreground">하위 태그</h2>
							<div className="flex flex-wrap gap-1">
								{children.map((c) => (
									<Link
										key={c.id}
										href={`/tags/${c.id}`}
										className="inline-flex items-center rounded-[2px] border px-2 py-0.5 text-sm hover:bg-muted"
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
		</PageShell>
	);
}
