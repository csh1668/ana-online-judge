import type { Metadata } from "next";
import Link from "next/link";
import { getProblems } from "@/actions/problems";
import { ProblemTypeBadge } from "@/components/problems/problem-type-badge";
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

export const metadata: Metadata = {
	title: "문제 목록",
	description: "풀어볼 수 있는 문제들을 확인하세요",
};

function getAcceptRate(submissionCount: number, acceptedCount: number) {
	if (submissionCount === 0) return "-";
	return `${((acceptedCount / submissionCount) * 100).toFixed(1)}%`;
}

export default async function ProblemsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const { problems, total } = await getProblems({ page, limit: 20 });
	const totalPages = Math.ceil(total / 20);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">문제 목록</CardTitle>
				</CardHeader>
				{/* <Separator /> */}
				<CardContent>
					{problems.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">등록된 문제가 없습니다.</div>
					) : (
						<>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-[80px]">#</TableHead>
											<TableHead>제목</TableHead>
											<TableHead className="w-[100px] text-right">제출</TableHead>
											<TableHead className="w-[100px] text-right">정답률</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{problems.map((problem) => (
											<TableRow key={problem.id}>
												<TableCell className="font-mono text-muted-foreground">
													{problem.id}
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<Link
															href={`/problems/${problem.id}`}
															className="font-medium hover:text-primary transition-colors"
														>
															{problem.title}
														</Link>
														<ProblemTypeBadge type={problem.problemType} />
														{!problem.isPublic && (
															<Badge variant="secondary" className="text-xs">
																비공개
															</Badge>
														)}
													</div>
												</TableCell>
												<TableCell className="text-right text-muted-foreground">
													{problem.submissionCount}
												</TableCell>
												<TableCell className="text-right text-muted-foreground">
													{getAcceptRate(problem.submissionCount, problem.acceptedCount)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>

							{/* Pagination */}
							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 mt-6">
									{page > 1 && (
										<Link
											href={`/problems?page=${page - 1}`}
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
											href={`/problems?page=${page + 1}`}
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
