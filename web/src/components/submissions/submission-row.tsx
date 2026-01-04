"use client";

import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import type { SubmissionListItem } from "@/actions/submissions";
import { SubmissionStatus } from "@/app/submissions/[id]/submission-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";

export const LANGUAGE_LABELS: Record<string, string> = {
	c: "C",
	cpp: "C++",
	python: "Python",
	java: "Java",
};

export function formatDate(date: Date) {
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

interface SubmissionRowProps {
	submission: SubmissionListItem;
	showDetail?: boolean;
	isAdmin?: boolean;
	currentUserId?: number | null;
}

export function SubmissionRow({
	submission,
	showDetail = true,
	isAdmin = false,
	currentUserId = null,
}: SubmissionRowProps) {
	const handleDownload = () => {
		window.location.href = `/api/submissions/${submission.id}/download`;
	};

	const canDownload = isAdmin || (currentUserId !== null && submission.userId === currentUserId);

	return (
		<TableRow>
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
				<div className="flex items-center gap-2">
					<Link
						href={
							submission.contestId && submission.contestProblemLabel
								? `/contests/${submission.contestId}/problems/${submission.contestProblemLabel}`
								: `/problems/${submission.problemId}`
						}
						className="hover:text-primary transition-colors"
					>
						{submission.problemTitle}
					</Link>
					{!submission.problemIsPublic && (
						<Badge variant="secondary" className="text-xs">
							비공개
						</Badge>
					)}
				</div>
			</TableCell>
			<TableCell>
				<SubmissionStatus
					submissionId={submission.id}
					initialVerdict={submission.verdict}
					score={submission.score ?? undefined}
					maxScore={submission.maxScore}
				/>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{submission.anigmaTaskType
					? `ANIGMA (Task ${submission.anigmaTaskType})`
					: LANGUAGE_LABELS[submission.language] || submission.language}
			</TableCell>
			<TableCell className="text-right text-muted-foreground">
				{submission.executionTime !== null ? `${submission.executionTime}ms` : "-"}
			</TableCell>
			<TableCell className="text-right text-muted-foreground">
				{submission.memoryUsed !== null ? `${submission.memoryUsed}KB` : "-"}
			</TableCell>
			<TableCell className="text-muted-foreground text-sm">
				{formatDate(submission.createdAt)}
			</TableCell>
			{showDetail && (
				<TableCell className="text-right">
					<div className="flex items-center justify-end gap-2">
						{canDownload && (
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								onClick={handleDownload}
								title="파일 다운로드"
							>
								<Download className="h-4 w-4" />
							</Button>
						)}
						<Link
							href={`/submissions/${submission.id}`}
							className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
						>
							<ChevronRight className="h-4 w-4" />
						</Link>
					</div>
				</TableCell>
			)}
		</TableRow>
	);
}

interface SubmissionTableHeaderProps {
	showDetail?: boolean;
	isAdmin?: boolean;
	canDownload?: boolean;
}

export function SubmissionTableHeader({
	showDetail = true,
	isAdmin = false,
	canDownload = false,
}: SubmissionTableHeaderProps) {
	return (
		<TableRow>
			<TableHead className="w-[80px]">#</TableHead>
			<TableHead className="w-[120px]">사용자</TableHead>
			<TableHead>문제</TableHead>
			<TableHead className="w-[100px]">결과</TableHead>
			<TableHead className="w-[80px]">언어</TableHead>
			<TableHead className="w-[100px] text-right">시간</TableHead>
			<TableHead className="w-[100px] text-right">메모리</TableHead>
			<TableHead className="w-[160px]">제출 시간</TableHead>
			{showDetail && <TableHead className={canDownload ? "w-[100px]" : "w-[50px]"} />}
		</TableRow>
	);
}
