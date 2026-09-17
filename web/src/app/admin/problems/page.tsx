import { FileText, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAdminProblems } from "@/actions/admin";
import {
	AdminFilterSelect,
	AdminListToolbar,
	AdminSearchInput,
	AdminSortableHeader,
} from "@/components/admin";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ProblemType } from "@/db/schema";
import { formatDate } from "@/lib/format-date";
import { DeleteProblemButton } from "./delete-button";

export const metadata: Metadata = {
	title: "문제 관리",
};

const PROBLEM_TYPE_LABEL: Record<ProblemType, string> = {
	icpc: "ICPC",
	special_judge: "Special",
	anigma: "Anigma",
	interactive: "Interactive",
	two_step: "Two Step",
};

export default async function AdminProblemsPage({
	searchParams,
}: {
	searchParams: Promise<{
		page?: string;
		q?: string;
		isPublic?: string;
		judgeAvailable?: string;
		problemType?: string;
		sort?: "id" | "createdAt" | "submissionCount";
		order?: "asc" | "desc";
	}>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const isPublic =
		params.isPublic === "true" ? true : params.isPublic === "false" ? false : undefined;
	const judgeAvailable =
		params.judgeAvailable === "true" ? true : params.judgeAvailable === "false" ? false : undefined;
	const problemType = (params.problemType as ProblemType | undefined) || undefined;

	const { problems, total } = await getAdminProblems({
		page,
		limit: 20,
		search: params.q,
		isPublic,
		judgeAvailable,
		problemType,
		sort: params.sort,
		order: params.order,
	});
	const totalPages = Math.ceil(total / 20);

	const buildPageHref = (target: number) => {
		const sp = new URLSearchParams();
		sp.set("page", String(target));
		if (params.q) sp.set("q", params.q);
		if (params.isPublic) sp.set("isPublic", params.isPublic);
		if (params.judgeAvailable) sp.set("judgeAvailable", params.judgeAvailable);
		if (params.problemType) sp.set("problemType", params.problemType);
		if (params.sort) sp.set("sort", params.sort);
		if (params.order) sp.set("order", params.order);
		return `/admin/problems?${sp.toString()}`;
	};

	return (
		<PageShell width="fluid" breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "문제" }]}>
			<Card>
				<PageHeader
					title="문제 관리"
					description={`총 ${total}개의 문제`}
					actions={
						<Button asChild>
							<Link href="/admin/problems/new">
								<Plus className="mr-2 h-4 w-4" />새 문제
							</Link>
						</Button>
					}
				/>
				<CardContent>
					<Suspense>
						<AdminListToolbar className="mb-4">
							<AdminSearchInput paramKey="q" placeholder="제목 또는 ID" className="w-[260px]" />
							<AdminFilterSelect
								paramKey="isPublic"
								placeholder="공개 여부"
								options={[
									{ value: "true", label: "공개" },
									{ value: "false", label: "비공개" },
								]}
							/>
							<AdminFilterSelect
								paramKey="judgeAvailable"
								placeholder="채점 가능"
								options={[
									{ value: "true", label: "채점 가능" },
									{ value: "false", label: "채점 준비중" },
								]}
							/>
							<AdminFilterSelect
								paramKey="problemType"
								placeholder="유형"
								options={[
									{ value: "icpc", label: "ICPC" },
									{ value: "special_judge", label: "Special Judge" },
									{ value: "anigma", label: "Anigma" },
									{ value: "interactive", label: "Interactive" },
									{ value: "two_step", label: "Two Step" },
								]}
							/>
						</AdminListToolbar>
					</Suspense>
					{problems.length === 0 ? (
						<EmptyState>조건에 맞는 문제가 없습니다.</EmptyState>
					) : (
						<>
							<Table className="min-w-[1030px]">
								<TableHeader>
									<TableRow>
										<Suspense>
											<AdminSortableHeader sortKey="id" className="w-[80px]">
												#
											</AdminSortableHeader>
										</Suspense>
										<TableHead>제목</TableHead>
										<TableHead className="w-[100px]">유형</TableHead>
										<TableHead className="w-[100px]">공개</TableHead>
										<TableHead className="w-[80px] text-right">TC</TableHead>
										<Suspense>
											<AdminSortableHeader
												sortKey="submissionCount"
												className="w-[80px] text-right"
											>
												제출
											</AdminSortableHeader>
										</Suspense>
										<TableHead className="w-[80px] text-right">AC</TableHead>
										<Suspense>
											<AdminSortableHeader sortKey="createdAt" className="w-[120px]">
												생성일
											</AdminSortableHeader>
										</Suspense>
										<TableHead className="w-[150px]">관리</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{problems.map((problem) => (
										<TableRow key={problem.id}>
											<TableCell className="font-mono">{problem.id}</TableCell>
											<TableCell className="font-medium">
												<div className="block truncate" title={problem.title}>
													{problem.title}
												</div>
											</TableCell>
											<TableCell>
												<Badge variant="outline">{PROBLEM_TYPE_LABEL[problem.problemType]}</Badge>
											</TableCell>
											<TableCell>
												<div className="flex flex-col gap-1">
													<Badge variant={problem.isPublic ? "default" : "secondary"}>
														{problem.isPublic ? "공개" : "비공개"}
													</Badge>
													{!problem.judgeAvailable && (
														<Badge
															variant="outline"
															className="bg-(--verdict-tle-bg) text-(--verdict-tle) border-(--verdict-tle)"
														>
															채점 준비중
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell className="text-right font-mono text-sm tabular-nums">
												{problem.testcaseCount}
											</TableCell>
											<TableCell className="text-right font-mono text-sm tabular-nums">
												{problem.submissionCount}
											</TableCell>
											<TableCell className="text-right font-mono text-sm tabular-nums">
												{problem.acceptedUserCount}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDate(problem.createdAt)}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<Button variant="ghost" size="icon" asChild>
														<Link href={`/admin/problems/${problem.id}`}>
															<Pencil className="h-4 w-4" />
														</Link>
													</Button>
													<Button variant="ghost" size="icon" asChild>
														<Link href={`/admin/problems/${problem.id}/testcases`}>
															<FileText className="h-4 w-4" />
														</Link>
													</Button>
													<DeleteProblemButton problemId={problem.id} title={problem.title} />
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>

							<PaginationLinks
								currentPage={page}
								totalPages={totalPages}
								buildHref={buildPageHref}
							/>
						</>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
