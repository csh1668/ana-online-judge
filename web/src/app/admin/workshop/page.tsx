import { ExternalLink, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { listAllWorkshopProblems } from "@/actions/admin/workshop";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { WorkshopSearchBar } from "./search-bar";

export const metadata: Metadata = {
	title: "창작마당 관리",
};

function formatDate(date: Date | null) {
	if (!date) return "-";
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export default async function AdminWorkshopPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { q } = await searchParams;
	const items = await listAllWorkshopProblems(q);

	return (
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "창작마당" }]} />
			<div>
				<h1 className="text-3xl font-bold">창작마당 관리</h1>
				<p className="text-muted-foreground mt-2">총 {items.length}개의 문제</p>
			</div>
			<WorkshopSearchBar />

			<Card>
				<CardContent className="p-0">
					{items.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">창작마당 문제가 없습니다.</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[80px]">#</TableHead>
									<TableHead>제목</TableHead>
									<TableHead>생성자</TableHead>
									<TableHead className="w-[90px]">테스트</TableHead>
									<TableHead>최근 스냅샷</TableHead>
									<TableHead>출판</TableHead>
									<TableHead className="w-[120px]">관리</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="font-mono">{item.id}</TableCell>
										<TableCell className="font-medium">{item.title}</TableCell>
										<TableCell className="text-muted-foreground">{item.ownerUsername}</TableCell>
										<TableCell>{item.latestSnapshotTestcaseCount}</TableCell>
										<TableCell className="text-muted-foreground">
											{item.latestSnapshotLabel
												? `${item.latestSnapshotLabel} · ${formatDate(item.latestSnapshotCreatedAt)}`
												: "없음"}
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
		</div>
	);
}
