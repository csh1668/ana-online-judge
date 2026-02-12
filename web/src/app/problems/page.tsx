import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getProblems } from "@/actions/problems";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ProblemSearch } from "@/components/problems/problem-search";
import { ProblemTypeBadges } from "@/components/problems/problem-type-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableHeader } from "@/components/ui/sortable-header";
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
	searchParams: Promise<{
		page?: string;
		search?: string;
		sort?: "id" | "title" | "createdAt";
		order?: "asc" | "desc";
	}>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const { problems, total } = await getProblems({
		page,
		limit: 20,
		search: params.search,
		sort: params.sort,
		order: params.order,
	});
	const totalPages = Math.ceil(total / 20);

	const session = await auth();
	const userProblemStatuses = session?.user?.id
		? await getUserProblemStatuses(
				problems.map((p) => p.id),
				parseInt(session.user.id, 10)
			)
		: new Map<number, { solved: boolean; score: number | null }>();

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
					<CardTitle className="text-2xl">문제 목록</CardTitle>
					<Suspense>
						<ProblemSearch />
					</Suspense>
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
											<TableHead className="w-[80px]">
												<Suspense fallback="#">
													<SortableHeader label="#" sortKey="id" />
												</Suspense>
											</TableHead>
											<TableHead>
												<Suspense fallback="제목">
													<SortableHeader label="제목" sortKey="title" />
												</Suspense>
											</TableHead>
											<TableHead className="w-[100px] text-right">제출</TableHead>
											<TableHead className="w-[100px] text-right">정답률</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{problems.map((problem) => {
											const problemStatus = userProblemStatuses.get(problem.id);
											const isSolved = problemStatus?.solved ?? false;
											const score = problemStatus?.score;

											return (
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
															<ProblemTypeBadges
																type={problem.problemType}
																judgeAvailable={problem.judgeAvailable}
															/>
															{!problem.isPublic && (
																<Badge variant="secondary" className="text-xs">
																	비공개
																</Badge>
															)}
															{isSolved && (
																<div className="flex items-center gap-1">
																	<CheckCircle2 className="h-4 w-4 text-green-600" />
																	{problem.problemType === "anigma" && score !== null && (
																		<span className="text-sm text-muted-foreground">{score}점</span>
																	)}
																</div>
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
											);
										})}
									</TableBody>
								</Table>
							</div>

							{/* Pagination */}
							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 mt-6">
									{page > 1 && (
										<Link
											href={`/problems?page=${page - 1}${params.search ? `&search=${params.search}` : ""}${params.sort ? `&sort=${params.sort}` : ""}${params.order ? `&order=${params.order}` : ""}`}
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
											href={`/problems?page=${page + 1}${params.search ? `&search=${params.search}` : ""}${params.sort ? `&sort=${params.sort}` : ""}${params.order ? `&order=${params.order}` : ""}`}
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
