import type { Metadata } from "next";
import { Suspense } from "react";
import { getProblems } from "@/actions/problems";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ProblemAvailabilityToggle } from "@/components/problems/problem-availability-toggle";
import { ProblemFilterTabs } from "@/components/problems/problem-filter-tabs";
import { ProblemSearch } from "@/components/problems/problem-search";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
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

type Sort = "id" | "title" | "createdAt" | "acceptRate" | "submissionCount";
type Filter = "all" | "unsolved" | "solved" | "wrong" | "new";

export default async function ProblemsPage({
	searchParams,
}: {
	searchParams: Promise<{
		page?: string;
		search?: string;
		sort?: Sort;
		order?: "asc" | "desc";
		filter?: Filter;
		includeUnavailable?: string;
	}>;
}) {
	const params = await searchParams;
	const session = await auth();
	const userId = session?.user?.id ? parseInt(session.user.id, 10) : undefined;

	const page = parseInt(params.page || "1", 10);
	const filter = params.filter || "all";
	const includeUnavailable = params.includeUnavailable === "1";

	const { problems, total } = await getProblems({
		page,
		limit: 20,
		search: params.search,
		sort: params.sort,
		order: params.order,
		filter,
		userId,
		includeUnavailable,
	});
	const totalPages = Math.ceil(total / 20);

	const userProblemStatuses = userId
		? await getUserProblemStatuses(
				problems.map((p) => p.id),
				userId
			)
		: new Map<number, { solved: boolean; score: number | null }>();

	const buildPageUrl = (targetPage: number) => {
		const p = new URLSearchParams();
		p.set("page", String(targetPage));
		if (params.search) p.set("search", params.search);
		if (params.sort) p.set("sort", params.sort);
		if (params.order) p.set("order", params.order);
		if (params.filter) p.set("filter", params.filter);
		if (params.includeUnavailable) p.set("includeUnavailable", params.includeUnavailable);
		return `/problems?${p.toString()}`;
	};

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
					<CardTitle className="text-2xl">문제 목록</CardTitle>
					<Suspense>
						<ProblemSearch />
					</Suspense>
				</CardHeader>
				<CardContent>
					<div className="mb-4 flex items-center justify-between gap-2">
						<Suspense>
							<ProblemFilterTabs isLoggedIn={!!userId} />
						</Suspense>
						<Suspense>
							<ProblemAvailabilityToggle />
						</Suspense>
					</div>

					{problems.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">
							{filter !== "all" && filter !== "new"
								? "조건에 맞는 문제가 없습니다."
								: "등록된 문제가 없습니다."}
						</div>
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
											<TableHead className="w-[100px] text-right">
												<Suspense fallback="제출">
													<SortableHeader
														label="제출"
														sortKey="submissionCount"
														className="justify-end"
													/>
												</Suspense>
											</TableHead>
											<TableHead className="w-[100px] text-right">
												<Suspense fallback="정답률">
													<SortableHeader
														label="정답률"
														sortKey="acceptRate"
														className="justify-end"
													/>
												</Suspense>
											</TableHead>
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
														<ProblemTitleCell
															href={`/problems/${problem.id}`}
															title={problem.title}
															problemType={problem.problemType}
															judgeAvailable={problem.judgeAvailable}
															isPublic={problem.isPublic}
															isSolved={isSolved}
															score={score}
														/>
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

							<PaginationLinks
								currentPage={page}
								totalPages={totalPages}
								buildHref={buildPageUrl}
							/>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
