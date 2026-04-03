"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { SubmissionListItem } from "@/actions/submissions";
import { getSubmissions } from "@/actions/submissions";
import { SubmissionStatus } from "@/app/submissions/[id]/submission-status";
import { formatDate, LANGUAGE_LABELS } from "@/components/submissions/submission-row";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface AllSubmissionsProps {
	problemId: number;
	initialSubmissions: SubmissionListItem[];
	initialTotal: number;
}

export function AllSubmissions({
	problemId,
	initialSubmissions,
	initialTotal,
}: AllSubmissionsProps) {
	const [submissions, setSubmissions] = useState(initialSubmissions);
	const [total, setTotal] = useState(initialTotal);
	const [page, setPage] = useState(1);
	const [isPending, startTransition] = useTransition();
	const limit = 20;
	const totalPages = Math.ceil(total / limit);

	const loadPage = (newPage: number) => {
		startTransition(async () => {
			const result = await getSubmissions({
				problemId,
				page: newPage,
				limit,
				sort: "createdAt",
				order: "desc",
			});
			setSubmissions(result.submissions);
			setTotal(result.total);
			setPage(newPage);
		});
	};

	if (submissions.length === 0) {
		return (
			<div className="py-8 text-center text-muted-foreground text-sm">아직 제출이 없습니다.</div>
		);
	}

	return (
		<div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[80px]">#</TableHead>
						<TableHead className="w-[100px]">사용자</TableHead>
						<TableHead className="w-[100px]">결과</TableHead>
						<TableHead className="w-[80px]">언어</TableHead>
						<TableHead className="w-[80px] text-right">시간</TableHead>
						<TableHead className="w-[80px] text-right">메모리</TableHead>
						<TableHead className="w-[80px] text-right">코드 길이</TableHead>
						<TableHead className="w-[140px]">제출 시간</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{submissions.map((sub) => (
						<TableRow key={sub.id}>
							<TableCell>
								<Link
									href={`/submissions/${sub.id}`}
									className="font-mono text-primary hover:underline"
								>
									{sub.id}
								</Link>
							</TableCell>
							<TableCell className="font-medium">
								<Link
									href={`/profile/${sub.userId}`}
									className="hover:text-primary transition-colors"
								>
									{sub.userName}
								</Link>
							</TableCell>
							<TableCell>
								<SubmissionStatus
									submissionId={sub.id}
									initialVerdict={sub.verdict}
									score={sub.score ?? undefined}
									maxScore={sub.maxScore}
								/>
							</TableCell>
							<TableCell className="text-muted-foreground">
								{LANGUAGE_LABELS[sub.language] || sub.language}
							</TableCell>
							<TableCell className="text-right text-muted-foreground">
								{sub.executionTime !== null ? `${sub.executionTime}ms` : "-"}
							</TableCell>
							<TableCell className="text-right text-muted-foreground">
								{sub.memoryUsed !== null ? `${sub.memoryUsed}KB` : "-"}
							</TableCell>
							<TableCell className="text-right text-muted-foreground">
								{sub.codeLength !== null ? `${sub.codeLength}B` : "-"}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{formatDate(sub.createdAt)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2 mt-4">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1 || isPending}
						onClick={() => loadPage(page - 1)}
					>
						이전
					</Button>
					<span className="text-sm text-muted-foreground">
						{page} / {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages || isPending}
						onClick={() => loadPage(page + 1)}
					>
						다음
					</Button>
				</div>
			)}
		</div>
	);
}
