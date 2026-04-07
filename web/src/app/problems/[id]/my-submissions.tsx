"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { SubmissionListItem } from "@/actions/submissions";
import { SubmissionStatus } from "@/app/submissions/[id]/submission-status";
import { formatDate, LANGUAGE_LABELS } from "@/components/submissions/submission-row";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface MySubmissionsProps {
	problemId: number;
	submissions: SubmissionListItem[];
	highlightSubmissionId?: number | null;
}

export function MySubmissions({
	problemId: _problemId,
	submissions,
	highlightSubmissionId = null,
}: MySubmissionsProps) {
	const sectionRef = useRef<HTMLDivElement>(null);

	// Scroll into view when a new submission is made
	useEffect(() => {
		const handler = () => {
			sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		};
		window.addEventListener("scroll-to-my-submissions", handler);
		return () => window.removeEventListener("scroll-to-my-submissions", handler);
	}, []);

	if (submissions.length === 0) {
		return (
			<div ref={sectionRef} className="py-8 text-center text-muted-foreground text-sm">
				아직 제출 내역이 없습니다.
			</div>
		);
	}

	return (
		<div ref={sectionRef}>
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
						<TableRow
							key={sub.id}
							className={highlightSubmissionId === sub.id ? "animate-highlight" : ""}
						>
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
									href={`/profile/${sub.userName}`}
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
		</div>
	);
}
