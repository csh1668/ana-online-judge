import type { Metadata } from "next";
import { getUpdateNotes } from "@/actions/update-notes";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";

export const metadata: Metadata = {
	title: "업데이트 노트",
	description: "ANA Online Judge의 업데이트 내역",
};

const PAGE_SIZE = 20;

function formatPublishedAt(date: Date): string {
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Seoul",
	}).format(date);
}

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
		<div className="page-container py-8">
			<PageBreadcrumb items={[{ label: "업데이트 노트" }]} />
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">업데이트 노트</CardTitle>
				</CardHeader>
				<CardContent>
					{items.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">
							아직 등록된 업데이트 노트가 없습니다.
						</div>
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
											{formatPublishedAt(note.publishedAt)}
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
		</div>
	);
}
