import type { Metadata } from "next";
import { getUpdateNotes } from "@/actions/update-notes";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = {
	title: "업데이트 내역",
	description: "업데이트 내역",
};

const PAGE_SIZE = 20;

export default async function UpdateNotesPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const sp = await searchParams;
	const page = Math.max(1, Number.parseInt(sp.page || "1", 10) || 1);
	const { items, total } = await getUpdateNotes({ page, limit: PAGE_SIZE });
	const totalPages = Math.ceil(total / PAGE_SIZE);

	return (
		<PageShell breadcrumb={[{ label: "업데이트 내역" }]}>
			<Card>
				<PageHeader title="업데이트 내역" />
				<CardContent>
					{items.length === 0 ? (
						<EmptyState>아직 등록된 업데이트 노트가 없습니다.</EmptyState>
					) : (
						<div className="divide-y divide-border">
							{items.map((note) => (
								<article key={note.id} className="py-6 first:pt-0 last:pb-0 space-y-3">
									<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
										<h2 className="text-lg font-semibold">{note.title}</h2>
										<time
											dateTime={note.publishedAt.toISOString()}
											className="font-mono text-xs text-muted-foreground"
										>
											{formatDate(note.publishedAt)}
										</time>
									</div>
									<MarkdownRenderer content={note.body} />
								</article>
							))}
						</div>
					)}
					{items.length > 0 && (
						<PaginationLinks
							currentPage={page}
							totalPages={totalPages}
							buildHref={(p) => `/updates?page=${p}`}
						/>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
