import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getContests } from "@/actions/contests";
import {
	AdminFilterSelect,
	AdminListToolbar,
	AdminSearchInput,
	AdminSortableHeader,
} from "@/components/admin";
import { ContestTime } from "@/components/contests/contest-time";
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
import { getContestStatus } from "@/lib/contest-utils";

export const metadata: Metadata = {
	title: "대회 관리",
	description: "대회를 생성하고 관리합니다",
};

function getStatusBadge(status: string) {
	switch (status) {
		case "upcoming":
			return <Badge variant="secondary">예정</Badge>;
		case "running":
			return <Badge variant="default">진행중</Badge>;
		case "finished":
			return <Badge variant="outline">종료</Badge>;
		default:
			return null;
	}
}

export default async function AdminContestsPage({
	searchParams,
}: {
	searchParams: Promise<{
		page?: string;
		q?: string;
		status?: "upcoming" | "running" | "finished";
		visibility?: "public" | "private";
		sort?: "id" | "startTime";
		order?: "asc" | "desc";
	}>;
}) {
	const params = await searchParams;
	const page = Number.parseInt(params.page || "1", 10);
	const { contests: contestsList, total } = await getContests({
		page,
		limit: 20,
		search: params.q,
		status: params.status,
		visibility: params.visibility,
		sort: params.sort,
		order: params.order,
	});
	const totalPages = Math.ceil(total / 20);

	const buildPageHref = (target: number) => {
		const sp = new URLSearchParams();
		sp.set("page", String(target));
		if (params.q) sp.set("q", params.q);
		if (params.status) sp.set("status", params.status);
		if (params.visibility) sp.set("visibility", params.visibility);
		if (params.sort) sp.set("sort", params.sort);
		if (params.order) sp.set("order", params.order);
		return `/admin/contests?${sp.toString()}`;
	};

	return (
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "대회" }]} />
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">대회 관리</h1>
					<p className="text-muted-foreground mt-2">총 {total}개의 대회</p>
				</div>
				<Button asChild>
					<Link href="/admin/contests/new">
						<Plus className="mr-2 h-4 w-4" />새 대회 만들기
					</Link>
				</Button>
			</div>

			<Suspense>
				<AdminListToolbar>
					<AdminSearchInput paramKey="q" placeholder="제목 검색" className="w-[260px]" />
					<AdminFilterSelect
						paramKey="status"
						placeholder="상태"
						options={[
							{ value: "upcoming", label: "예정" },
							{ value: "running", label: "진행중" },
							{ value: "finished", label: "종료" },
						]}
					/>
					<AdminFilterSelect
						paramKey="visibility"
						placeholder="공개범위"
						options={[
							{ value: "public", label: "공개" },
							{ value: "private", label: "비공개" },
						]}
					/>
				</AdminListToolbar>
			</Suspense>

			<Card>
				<CardContent className="p-0">
					{contestsList.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">
							조건에 맞는 대회가 없습니다.
						</div>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<Suspense>
											<AdminSortableHeader sortKey="id" className="w-[80px]">
												#
											</AdminSortableHeader>
										</Suspense>
										<TableHead>제목</TableHead>
										<TableHead className="w-[100px]">공개범위</TableHead>
										<TableHead className="w-[100px]">상태</TableHead>
										<TableHead className="w-[80px]">참가자</TableHead>
										<TableHead className="w-[80px]">문제</TableHead>
										<Suspense>
											<AdminSortableHeader sortKey="startTime" className="w-[180px]">
												시작
											</AdminSortableHeader>
										</Suspense>
										<TableHead className="w-[180px]">종료</TableHead>
										<TableHead className="w-[120px] text-right">작업</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{contestsList.map((contest) => {
										const status = getContestStatus(contest);
										return (
											<TableRow key={contest.id}>
												<TableCell className="font-mono text-muted-foreground">
													{contest.id}
												</TableCell>
												<TableCell>
													<Link
														href={`/admin/contests/${contest.id}`}
														className="font-medium hover:text-primary transition-colors"
													>
														{contest.title}
													</Link>
												</TableCell>
												<TableCell>
													<Badge
														variant={contest.visibility === "public" ? "default" : "secondary"}
													>
														{contest.visibility === "public" ? "공개" : "비공개"}
													</Badge>
												</TableCell>
												<TableCell>{getStatusBadge(status)}</TableCell>
												<TableCell className="font-mono text-sm">
													{contest.participantCount}
												</TableCell>
												<TableCell className="font-mono text-sm">{contest.problemCount}</TableCell>
												<TableCell className="text-muted-foreground">
													<ContestTime date={contest.startTime} />
												</TableCell>
												<TableCell className="text-muted-foreground">
													<ContestTime date={contest.endTime} />
												</TableCell>
												<TableCell className="text-right">
													<Link href={`/admin/contests/${contest.id}`}>
														<Button variant="outline" size="sm">
															관리
														</Button>
													</Link>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>

							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 mt-6">
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
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
