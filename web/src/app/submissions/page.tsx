import type { Metadata } from "next";
import Link from "next/link";
import { getSubmissions } from "@/actions/submissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
	title: "제출 현황",
	description: "모든 제출 현황을 확인하세요",
};

const VERDICT_LABELS: Record<
	string,
	{ label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
	pending: { label: "대기 중", variant: "outline" },
	judging: { label: "채점 중", variant: "secondary" },
	accepted: { label: "정답", variant: "default" },
	wrong_answer: { label: "오답", variant: "destructive" },
	time_limit_exceeded: { label: "시간 초과", variant: "destructive" },
	memory_limit_exceeded: { label: "메모리 초과", variant: "destructive" },
	runtime_error: { label: "런타임 에러", variant: "destructive" },
	compile_error: { label: "컴파일 에러", variant: "destructive" },
	system_error: { label: "시스템 에러", variant: "destructive" },
};

const LANGUAGE_LABELS: Record<string, string> = {
	c: "C",
	cpp: "C++",
	python: "Python",
	java: "Java",
};

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

export default async function SubmissionsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string; me?: string }>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const { submissions, total } = await getSubmissions({ page, limit: 20 });
	const totalPages = Math.ceil(total / 20);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">제출 현황</CardTitle>
					<CardDescription>총 {total}개의 제출이 있습니다</CardDescription>
				</CardHeader>
				<CardContent>
					{submissions.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">제출 내역이 없습니다.</div>
					) : (
						<>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-[80px]">#</TableHead>
											<TableHead className="w-[120px]">사용자</TableHead>
											<TableHead>문제</TableHead>
											<TableHead className="w-[100px]">결과</TableHead>
											<TableHead className="w-[80px]">언어</TableHead>
											<TableHead className="w-[100px] text-right">시간</TableHead>
											<TableHead className="w-[100px] text-right">메모리</TableHead>
											<TableHead className="w-[160px]">제출 시간</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{submissions.map((submission) => {
											const verdictInfo = VERDICT_LABELS[submission.verdict] || {
												label: submission.verdict,
												variant: "outline" as const,
											};

											return (
												<TableRow key={submission.id}>
													<TableCell>
														<Link
															href={`/submissions/${submission.id}`}
															className="font-mono text-primary hover:underline"
														>
															{submission.id}
														</Link>
													</TableCell>
													<TableCell className="font-medium">{submission.userName}</TableCell>
													<TableCell>
														<Link
															href={`/problems/${submission.problemId}`}
															className="hover:text-primary transition-colors"
														>
															{submission.problemTitle}
														</Link>
													</TableCell>
													<TableCell>
														<Badge
															variant={verdictInfo.variant}
															className={
																submission.verdict === "accepted"
																	? "bg-emerald-500 hover:bg-emerald-600"
																	: ""
															}
														>
															{verdictInfo.label}
														</Badge>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{LANGUAGE_LABELS[submission.language] || submission.language}
													</TableCell>
													<TableCell className="text-right text-muted-foreground">
														{submission.executionTime !== null
															? `${submission.executionTime}ms`
															: "-"}
													</TableCell>
													<TableCell className="text-right text-muted-foreground">
														{submission.memoryUsed !== null ? `${submission.memoryUsed}KB` : "-"}
													</TableCell>
													<TableCell className="text-muted-foreground text-sm">
														{formatDate(submission.createdAt)}
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
											href={`/submissions?page=${page - 1}`}
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
											href={`/submissions?page=${page + 1}`}
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
