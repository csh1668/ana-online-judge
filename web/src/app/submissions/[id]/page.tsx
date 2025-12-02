import { AlertCircle, Calendar, Clock, Code2, HardDrive, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmissionById } from "@/actions/submissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { SubmissionStatus } from "./submission-status";

interface Props {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return {
		title: `제출 #${id}`,
		description: `제출 ${id}번의 상세 결과`,
	};
}

const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
	pending: { label: "대기 중", color: "bg-gray-500" },
	judging: { label: "채점 중", color: "bg-blue-500" },
	accepted: { label: "정답", color: "bg-emerald-500" },
	wrong_answer: { label: "오답", color: "bg-rose-500" },
	time_limit_exceeded: { label: "시간 초과", color: "bg-amber-500" },
	memory_limit_exceeded: { label: "메모리 초과", color: "bg-orange-500" },
	runtime_error: { label: "런타임 에러", color: "bg-purple-500" },
	compile_error: { label: "컴파일 에러", color: "bg-pink-500" },
	system_error: { label: "시스템 에러", color: "bg-red-500" },
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
		second: "2-digit",
	}).format(date);
}

export default async function SubmissionDetailPage({ params }: Props) {
	const { id } = await params;
	const submission = await getSubmissionById(parseInt(id, 10));

	if (!submission) {
		notFound();
	}

	const _verdictInfo = VERDICT_LABELS[submission.verdict] || {
		label: submission.verdict,
		color: "bg-gray-500",
	};

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="space-y-6">
				{/* Summary Card */}
				<Card>
					<CardHeader>
						<div className="flex items-start justify-between">
							<div>
								<CardTitle className="text-2xl flex items-center gap-2">
									제출 #{submission.id}
									<SubmissionStatus
										submissionId={submission.id}
										initialVerdict={submission.verdict}
									/>
								</CardTitle>
								<Link
									href={`/problems/${submission.problemId}`}
									className="text-lg text-muted-foreground hover:text-primary transition-colors mt-2 block"
								>
									{submission.problemTitle}
								</Link>
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent className="pt-6">
						<div className="grid grid-cols-2 md:grid-cols-5 gap-6">
							<div className="flex items-center gap-2">
								<User className="h-4 w-4 text-muted-foreground" />
								<div>
									<div className="text-sm text-muted-foreground">제출자</div>
									<div className="font-medium">{submission.userName}</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Code2 className="h-4 w-4 text-muted-foreground" />
								<div>
									<div className="text-sm text-muted-foreground">언어</div>
									<div className="font-medium">
										{LANGUAGE_LABELS[submission.language] || submission.language}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Clock className="h-4 w-4 text-muted-foreground" />
								<div>
									<div className="text-sm text-muted-foreground">실행 시간</div>
									<div className="font-medium">
										{submission.executionTime !== null ? `${submission.executionTime}ms` : "-"}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<HardDrive className="h-4 w-4 text-muted-foreground" />
								<div>
									<div className="text-sm text-muted-foreground">메모리</div>
									<div className="font-medium">
										{submission.memoryUsed !== null ? `${submission.memoryUsed}KB` : "-"}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Calendar className="h-4 w-4 text-muted-foreground" />
								<div>
									<div className="text-sm text-muted-foreground">제출 시간</div>
									<div className="font-medium text-sm">{formatDate(submission.createdAt)}</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Compile Error */}
				{submission.verdict === "compile_error" && submission.errorMessage && (
					<Card className="border-pink-500/50">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-pink-500">
								<AlertCircle className="h-5 w-5" />
								컴파일 에러
							</CardTitle>
						</CardHeader>
						<CardContent>
							<pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm font-mono whitespace-pre-wrap text-rose-400">
								<code>{submission.errorMessage}</code>
							</pre>
						</CardContent>
					</Card>
				)}

				{/* Testcase Results */}
				{submission.testcaseResults.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>테스트케이스 결과</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-[80px]">#</TableHead>
											<TableHead>결과</TableHead>
											<TableHead className="text-right">실행 시간</TableHead>
											<TableHead className="text-right">메모리</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{submission.testcaseResults.map((result, index) => {
											const tcVerdictInfo = VERDICT_LABELS[result.verdict] || {
												label: result.verdict,
												color: "bg-gray-500",
											};
											return (
												<TableRow key={result.id}>
													<TableCell className="font-mono">{index + 1}</TableCell>
													<TableCell>
														<Badge
															className={`${tcVerdictInfo.color} hover:${tcVerdictInfo.color}`}
														>
															{tcVerdictInfo.label}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														{result.executionTime !== null ? `${result.executionTime}ms` : "-"}
													</TableCell>
													<TableCell className="text-right">
														{result.memoryUsed !== null ? `${result.memoryUsed}KB` : "-"}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Source Code */}
				<Card>
					<CardHeader>
						<CardTitle>소스 코드</CardTitle>
					</CardHeader>
					<CardContent>
						<pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm font-mono">
							<code>{submission.code}</code>
						</pre>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
