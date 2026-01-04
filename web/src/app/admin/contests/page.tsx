import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getContests } from "@/actions/contests";
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
import { ContestTime } from "@/components/contests/contest-time";

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
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = Number.parseInt(params.page || "1", 10);
	const { contests: contestsList, total } = await getContests({ page, limit: 20 });
	const totalPages = Math.ceil(total / 20);

	return (
		<div className="space-y-6">
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

			<Card>
				<CardContent className="p-0">
					{contestsList.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">등록된 대회가 없습니다.</div>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[80px]">#</TableHead>
										<TableHead>제목</TableHead>
										<TableHead className="w-[100px]">공개범위</TableHead>
										<TableHead className="w-[100px]">상태</TableHead>
										<TableHead className="w-[180px]">시작 시간</TableHead>
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
												<TableCell className="text-muted-foreground">
													<ContestTime date={contest.startTime} />
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
											href={`/admin/contests?page=${page - 1}`}
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
											href={`/admin/contests?page=${page + 1}`}
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
