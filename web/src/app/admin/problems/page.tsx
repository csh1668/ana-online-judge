import { FileText, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getAdminProblems } from "@/actions/admin";
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
import { DeleteProblemButton } from "./delete-button";

export const metadata: Metadata = {
	title: "문제 관리",
};

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export default async function AdminProblemsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const { problems, total } = await getAdminProblems({ page, limit: 20 });
	const totalPages = Math.ceil(total / 20);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">문제 관리</h1>
					<p className="text-muted-foreground mt-2">총 {total}개의 문제</p>
				</div>
				<Button asChild>
					<Link href="/admin/problems/new">
						<Plus className="mr-2 h-4 w-4" />새 문제
					</Link>
				</Button>
			</div>

			<Card>
				<CardContent className="p-0">
					{problems.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">등록된 문제가 없습니다.</div>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[80px]">#</TableHead>
										<TableHead>제목</TableHead>
										<TableHead className="w-[100px]">공개</TableHead>
										<TableHead className="w-[120px]">생성일</TableHead>
										<TableHead className="w-[150px]">관리</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{problems.map((problem) => (
										<TableRow key={problem.id}>
											<TableCell className="font-mono">{problem.id}</TableCell>
											<TableCell className="font-medium">{problem.title}</TableCell>
											<TableCell>
												<Badge variant={problem.isPublic ? "default" : "secondary"}>
													{problem.isPublic ? "공개" : "비공개"}
												</Badge>
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

							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 p-4 border-t">
									{page > 1 && (
										<Link
											href={`/admin/problems?page=${page - 1}`}
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
											href={`/admin/problems?page=${page + 1}`}
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
