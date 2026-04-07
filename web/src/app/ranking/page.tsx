import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getUserRanking } from "@/lib/services/ranking";

export const metadata = { title: "랭킹 — AOJ" };

export default async function RankingPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const { page: pageStr } = await searchParams;
	const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
	const limit = 50;

	const { rankings, total } = await getUserRanking({ page, limit });
	const totalPages = Math.ceil(total / limit);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">전체 랭킹</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[60px]">#</TableHead>
								<TableHead>사용자</TableHead>
								<TableHead className="text-right w-[100px]">푼 문제</TableHead>
								<TableHead className="text-right w-[100px]">제출</TableHead>
								<TableHead className="text-right w-[100px]">정답률</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rankings.map((item, index) => {
								const rank = (page - 1) * limit + index + 1;
								const initials = item.name.slice(0, 2).toUpperCase();

								return (
									<TableRow key={item.userId}>
										<TableCell className="font-mono font-bold">{rank}</TableCell>
										<TableCell>
											<Link
												href={`/profile/${item.username}`}
												className="flex items-center gap-2 hover:text-primary transition-colors"
											>
												<Avatar className="h-6 w-6">
													<AvatarImage src={item.avatarUrl ?? undefined} />
													<AvatarFallback className="text-xs">{initials}</AvatarFallback>
												</Avatar>
												<span className="font-medium">{item.name}</span>
												<span className="text-sm text-muted-foreground">@{item.username}</span>
											</Link>
										</TableCell>
										<TableCell className="text-right font-mono">{item.solvedCount}</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{item.submissionCount}
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{item.acceptRate}%
										</TableCell>
									</TableRow>
								);
							})}
							{rankings.length === 0 && (
								<TableRow>
									<TableCell colSpan={5} className="text-center text-muted-foreground py-8">
										아직 사용자가 없습니다
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
					<PaginationLinks
						currentPage={page}
						totalPages={totalPages}
						buildHref={(p) => `/ranking?page=${p}`}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
