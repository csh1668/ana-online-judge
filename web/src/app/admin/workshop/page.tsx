import { ExternalLink, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listAllWorkshopProblems } from "@/actions/admin/workshop";
import { AdminFilterSelect, AdminListToolbar } from "@/components/admin";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate as formatDateToken } from "@/lib/format-date";
import { WorkshopSearchBar } from "./search-bar";

export const metadata: Metadata = {
	title: "창작마당 관리",
};

export const dynamic = "force-dynamic";

function formatDate(date: Date | null) {
	if (!date) return "-";
	return formatDateToken(date);
}

export default async function AdminWorkshopPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; published?: "true" | "false" }>;
}) {
	const { q, published } = await searchParams;
	const publishedFilter = published === "true" ? true : published === "false" ? false : undefined;
	const items = await listAllWorkshopProblems(q, { published: publishedFilter });

	return (
		<PageShell
			width="fluid"
			breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "창작마당" }]}
		>
			<Card>
				<PageHeader title="창작마당 관리" description={`총 ${items.length}개의 문제`} />
				<CardContent>
					<Suspense>
						<AdminListToolbar className="mb-4">
							<WorkshopSearchBar />
							<AdminFilterSelect
								paramKey="published"
								placeholder="출판 여부"
								options={[
									{ value: "true", label: "출판됨" },
									{ value: "false", label: "미출판" },
								]}
							/>
						</AdminListToolbar>
					</Suspense>
					{items.length === 0 ? (
						<EmptyState>조건에 맞는 문제가 없습니다.</EmptyState>
					) : (
						<Table className="min-w-[1010px]">
							<TableHeader>
								<TableRow>
									<TableHead className="w-[80px]">#</TableHead>
									<TableHead>제목</TableHead>
									<TableHead className="w-[140px]">생성자</TableHead>
									<TableHead className="w-[90px] text-right">테스트</TableHead>
									<TableHead className="w-[200px]">최근 스냅샷</TableHead>
									<TableHead className="w-[140px]">출판</TableHead>
									<TableHead className="w-[120px]">관리</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="font-mono">{item.id}</TableCell>
										<TableCell className="font-medium">
											<div className="block truncate" title={item.title}>
												{item.title}
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground">
											<div className="block truncate" title={item.ownerUsername}>
												{item.ownerUsername}
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{item.latestSnapshotTestcaseCount}
										</TableCell>
										<TableCell className="text-muted-foreground">
											<div
												className="block truncate"
												title={
													item.latestSnapshotLabel
														? `${item.latestSnapshotLabel} · ${formatDate(item.latestSnapshotCreatedAt)}`
														: "없음"
												}
											>
												{item.latestSnapshotLabel
													? `${item.latestSnapshotLabel} · ${formatDate(item.latestSnapshotCreatedAt)}`
													: "없음"}
											</div>
										</TableCell>
										<TableCell>
											{item.publishedProblemId ? (
												<Link
													href={`/admin/problems/${item.publishedProblemId}`}
													className="inline-flex items-center gap-1 text-xs underline"
												>
													<Badge variant="default">출판됨 #{item.publishedProblemId}</Badge>
													<ExternalLink className="h-3 w-3" />
												</Link>
											) : (
												<Badge variant="secondary">미출판</Badge>
											)}
										</TableCell>
										<TableCell>
											<Button variant="ghost" size="icon" asChild>
												<Link href={`/admin/workshop/${item.id}`}>
													<Pencil className="h-4 w-4" />
												</Link>
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
