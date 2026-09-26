import { AlertCircle, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	getActiveLanguageEditorInfos,
	getLanguageLabelMapAction,
} from "@/actions/languages/queries";
import { getSubmissionById } from "@/actions/submissions";
import { getSubmissionViewers } from "@/actions/submissions/views";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { CodeEditor } from "@/components/problems/code-editor";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { RecordView } from "./record-view";
import { SubmissionCodeBlocked } from "./submission-code-blocked";
import { SubmissionStatus } from "./submission-status";
import { ViewerList } from "./viewer-list";
import { VisibilityControl } from "./visibility-control";

function groupBySubtask<T extends { subtaskGroup: number | null }>(rows: T[]): T[][] {
	const map = new Map<number, T[]>();
	for (const r of rows) {
		const g = r.subtaskGroup ?? 0;
		if (!map.has(g)) map.set(g, []);
		map.get(g)!.push(r);
	}
	return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

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

	const [session, languageInfos, languageLabels] = await Promise.all([
		auth(),
		getActiveLanguageEditorInfos(),
		getLanguageLabelMapAction(),
	]);
	const monacoLanguage =
		languageInfos.find((l) => l.value === submission.language)?.monacoLanguage ??
		submission.language;
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;
	const isOwnSubmission = currentUserId !== null && submission.userId === currentUserId;
	const canViewEditDistance = isAdmin || isOwnSubmission;

	// 체커 출력: 제출자에게는 문제 설정(showCheckerOutput)이 켜진 경우에만 공개.
	// 관리자는 설정과 무관하게 항상 보되, 공개 OFF 상태면 "(admin)" 접두로 표시.
	const checkerOutputPublic = submission.problemShowCheckerOutput;
	const canSeeCheckerOutput = isAdmin || checkerOutputPublic;
	const checkerOutputAdminOnly = isAdmin && !checkerOutputPublic;

	return (
		<PageShell
			breadcrumb={[{ label: "제출 현황", href: "/submissions" }, { label: `#${submission.id}` }]}
		>
			{submission.codeAccess.allowed && <RecordView submissionId={submission.id} />}
			<Card>
				<PageHeader
					title={`#${submission.id}`}
					meta={
						<SubmissionStatus
							submissionId={submission.id}
							initialVerdict={submission.verdict}
							score={submission.score ?? undefined}
							maxScore={submission.maxScore}
							useFullJudge={submission.problemUseFullJudge && submission.problemType !== "anigma"}
							passedTestcases={submission.passedTestcases}
							totalTestcases={submission.totalTestcases}
						/>
					}
					actions={
						<>
							{(isAdmin || isOwnSubmission) && !submission.contestId && (
								<VisibilityControl submissionId={submission.id} initial={submission.visibility} />
							)}
							{submission.codeAccess.allowed && (
								<Button variant="outline" size="sm" asChild>
									<Link href={`/api/submissions/${submission.id}/download`}>
										<Download className="mr-2 h-4 w-4" />
										파일 다운로드
									</Link>
								</Button>
							)}
						</>
					}
				/>

				<CardContent className="space-y-6">
					{/* 소스 코드 (Anigma가 아닌 경우에만 표시) */}
					{submission.problemType !== "anigma" &&
						(submission.codeAccess.allowed ? (
							<CodeEditor code={submission.code} monacoLanguage={monacoLanguage} readOnly />
						) : (
							<SubmissionCodeBlocked reason={submission.codeAccess.reason} />
						))}

					{/* 에러 메시지 (compile_error일 때만) */}
					{submission.codeAccess.allowed &&
						submission.verdict === "compile_error" &&
						submission.errorMessage && (
							<div className="rounded-[2px] bg-[var(--verdict-wrong-bg)] border border-[var(--verdict-wrong)] p-4">
								<div className="flex items-center gap-2 text-[var(--verdict-wrong)] font-medium mb-2">
									<AlertCircle className="h-4 w-4" />
									컴파일 에러
								</div>
								<pre className="text-sm font-mono whitespace-pre-wrap text-[var(--verdict-wrong)] overflow-x-auto">
									{submission.errorMessage}
								</pre>
							</div>
						)}

					{/* Anigma 점수 상세 (Anigma 문제일 경우에만 표시) */}
					{submission.problemType === "anigma" && (
						<>
							<Separator />
							<div className="rounded-[2px] border bg-muted/10 overflow-hidden">
								<div className="p-4 bg-muted/30 border-b font-medium flex items-center gap-2">
									<span>채점 결과</span>
									<span className="text-sm text-muted-foreground font-normal ml-auto flex items-center gap-4">
										총점: <span className="font-bold text-primary">{submission.score}</span> /{" "}
										{submission.maxScore}
										{canViewEditDistance &&
											submission.editDistance !== null &&
											submission.editDistance !== undefined && (
												<>
													<span className="text-muted-foreground/50">|</span>
													Edit Distance:{" "}
													<span className="font-mono">{submission.editDistance}</span>
												</>
											)}
									</span>
								</div>
							</div>
						</>
					)}

					<Separator />

					{/* 메타 정보 */}
					<Table className="min-w-[1060px]">
						<TableHeader>
							<SubmissionTableHeader showDetail={false} isAdmin={isAdmin} />
						</TableHeader>
						<TableBody>
							<SubmissionRow
								submission={submission}
								showDetail={false}
								isAdmin={isAdmin}
								languageLabels={languageLabels}
							/>
						</TableBody>
					</Table>

					{submission.hasSubtasks && submission.testcaseResults.length > 0 && (
						<>
							<Separator />
							<div className="rounded-[2px] border">
								<div className="p-4 font-medium">서브태스크</div>
								<div className="divide-y">
									{groupBySubtask(submission.testcaseResults).map((grp) => {
										const groupMax = grp.reduce((acc, r) => acc + (r.score ?? 0), 0);
										const groupScore = grp.every((r) => r.verdict === "accepted") ? groupMax : 0;
										return (
											<div
												key={grp[0].subtaskGroup ?? 0}
												className="flex items-center justify-between p-3"
											>
												<div className="flex items-center gap-3">
													<span className="font-medium">Subtask {grp[0].subtaskGroup ?? 0}</span>
													<span className="text-sm text-muted-foreground">{grp.length} TC</span>
												</div>
												<div className="font-mono text-sm">
													{groupScore} / {groupMax}
												</div>
											</div>
										);
									})}
								</div>
							</div>
						</>
					)}

					{/* 테스트케이스 결과 */}
					{submission.testcaseResults.length > 0 && (
						<>
							<Separator />
							<Table className="min-w-[640px]">
								<TableHeader>
									<TableRow>
										<TableHead className="w-[64px]">#</TableHead>
										<TableHead>결과</TableHead>
										<TableHead className="w-[96px] text-right">시간</TableHead>
										<TableHead className="w-[96px] text-right">메모리</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{submission.testcaseResults.map((result, index) => (
										<TableRow key={result.id}>
											<TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell>
											<TableCell>
												<div className="space-y-1">
													<SubmissionStatus
														submissionId={submission.id}
														initialVerdict={result.verdict}
														score={submission.score ?? undefined}
														// maxScore={submission.maxScore}
													/>
													{canSeeCheckerOutput && result.checkerMessage && (
														<pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap max-w-md truncate">
															{checkerOutputAdminOnly && "(admin) "}
															{result.checkerMessage}
														</pre>
													)}
												</div>
											</TableCell>
											<TableCell className="text-right tabular-nums text-muted-foreground">
												{result.executionTime !== null ? `${result.executionTime}ms` : "-"}
											</TableCell>
											<TableCell className="text-right tabular-nums text-muted-foreground">
												{result.memoryUsed !== null ? `${result.memoryUsed}KB` : "-"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</>
					)}
				</CardContent>
			</Card>

			{(isOwnSubmission || isAdmin) && (
				<ViewerList viewers={await getSubmissionViewers(submission.id)} />
			)}
		</PageShell>
	);
}
