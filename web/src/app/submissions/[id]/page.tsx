import { AlertCircle, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getSubmissionById } from "@/actions/submissions";
import { CodeEditor } from "@/components/problems/code-editor";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Button } from "@/components/ui/button";
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

export default async function SubmissionDetailPage({ params }: Props) {
	const { id } = await params;
	const submission = await getSubmissionById(parseInt(id, 10));

	if (!submission) {
		notFound();
	}

	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between mb-1">
						<div className="flex items-center gap-2 text-muted-foreground">
							<span className="font-mono">#{submission.id}</span>
						</div>
						{isAdmin && (
							<Button variant="outline" size="sm" asChild>
								<Link href={`/api/submissions/${submission.id}/download`}>
									<Download className="mr-2 h-4 w-4" />
									파일 다운로드
								</Link>
							</Button>
						)}
					</div>
					<CardTitle className="text-xl">제출</CardTitle>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* 소스 코드 (Anigma가 아닌 경우에만 표시) */}
					{submission.problemType !== "anigma" && (
						<CodeEditor code={submission.code} language={submission.language} readOnly />
					)}

					{/* 에러 메시지 (compile_error일 때만) */}
					{submission.verdict === "compile_error" && submission.errorMessage && (
						<div className="rounded-md bg-rose-500/10 border border-rose-500/30 p-4">
							<div className="flex items-center gap-2 text-rose-500 font-medium mb-2">
								<AlertCircle className="h-4 w-4" />
								컴파일 에러
							</div>
							<pre className="text-sm font-mono whitespace-pre-wrap text-rose-400 overflow-x-auto">
								{submission.errorMessage}
							</pre>
						</div>
					)}

					{/* Anigma 점수 상세 (Anigma 문제일 경우에만 표시) */}
					{/* score만 표시하도록 변경됨 */}
					{submission.problemType === "anigma" && (
						<>
							<Separator />
							<div className="rounded-md border bg-muted/10 overflow-hidden">
								<div className="p-4 bg-muted/30 border-b font-medium flex items-center gap-2">
									<span>채점 결과</span>
									<span className="text-sm text-muted-foreground font-normal ml-auto flex items-center gap-4">
										총점: <span className="font-bold text-primary">{submission.score}</span> /{" "}
										{submission.maxScore}
										{submission.editDistance !== null && submission.editDistance !== undefined && (
											<>
												<span className="text-muted-foreground/50">|</span>
												Edit Distance: <span className="font-mono">{submission.editDistance}</span>
											</>
										)}
									</span>
								</div>
							</div>
						</>
					)}

					<Separator />

					{/* 메타 정보 */}
					<div className="rounded-md border overflow-x-auto">
						<Table>
							<TableHeader>
								<SubmissionTableHeader showDetail={false} isAdmin={isAdmin} />
							</TableHeader>
							<TableBody>
								<SubmissionRow submission={submission} showDetail={false} isAdmin={isAdmin} />
							</TableBody>
						</Table>
					</div>

					{/* 테스트케이스 결과 */}
					{submission.testcaseResults.length > 0 && (
						<>
							<Separator />
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-16">#</TableHead>
											<TableHead>결과</TableHead>
											<TableHead className="text-right w-24">시간</TableHead>
											<TableHead className="text-right w-24">메모리</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{submission.testcaseResults.map((result, index) => (
											<TableRow key={result.id}>
												<TableCell className="font-mono text-muted-foreground">
													{index + 1}
												</TableCell>
												<TableCell>
													<SubmissionStatus
														submissionId={submission.id}
														initialVerdict={result.verdict}
														score={submission.score ?? undefined}
														// maxScore={submission.maxScore}
													/>
												</TableCell>
												<TableCell className="text-right text-muted-foreground">
													{result.executionTime !== null ? `${result.executionTime}ms` : "-"}
												</TableCell>
												<TableCell className="text-right text-muted-foreground">
													{result.memoryUsed !== null ? `${result.memoryUsed}KB` : "-"}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
