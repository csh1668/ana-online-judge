import type { Metadata } from "next";
import Link from "next/link";
import { getContests } from "@/actions/contests";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	title: "대회 목록",
	description: "진행 중인 대회와 예정된 대회를 확인하세요",
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

export default async function ContestsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = Number.parseInt(params.page || "1", 10);
	const { contests: contestsList, total } = await getContests({ page, limit: 20 });
	const totalPages = Math.ceil(total / 20);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">대회 목록</CardTitle>
				</CardHeader>
				<CardContent>
					{contestsList.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">등록된 대회가 없습니다.</div>
					) : (
						<>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-[80px]">#</TableHead>
											<TableHead>제목</TableHead>
											<TableHead className="w-[120px]">상태</TableHead>
											<TableHead className="w-[180px]">시작 시간</TableHead>
											<TableHead className="w-[180px]">종료 시간</TableHead>
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
															href={`/contests/${contest.id}`}
															className="font-medium hover:text-primary transition-colors"
														>
															{contest.title}
														</Link>
													</TableCell>
													<TableCell>{getStatusBadge(status)}</TableCell>
													<TableCell className="text-muted-foreground">
														<ContestTime date={contest.startTime} />
													</TableCell>
													<TableCell className="text-muted-foreground">
														<ContestTime date={contest.endTime} />
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>

							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 mt-6">
									{page > 1 && (
										<Link
											href={`/contests?page=${page - 1}`}
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
											href={`/contests?page=${page + 1}`}
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
