"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
	initialSubmissions: SubmissionListItem[];
}

export function MySubmissions({ problemId: _problemId, initialSubmissions }: MySubmissionsProps) {
	const [submissions, setSubmissions] = useState(initialSubmissions);
	const [highlightId, setHighlightId] = useState<number | null>(null);
	const sectionRef = useRef<HTMLDivElement>(null);

	// Listen for custom event dispatched when a new submission is made
	useEffect(() => {
		const handler = (e: CustomEvent<SubmissionListItem>) => {
			setSubmissions((prev) => [e.detail, ...prev]);
			setHighlightId(e.detail.id);
			setTimeout(() => setHighlightId(null), 3000);
			sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		};

		window.addEventListener("new-submission", handler as EventListener);
		return () => window.removeEventListener("new-submission", handler as EventListener);
	}, []);

	// Listen for judge completion to update execution time / memory
	useEffect(() => {
		const handler = (
			e: CustomEvent<{
				id: number;
				verdict: string;
				score?: number;
				executionTime: number | null;
				memoryUsed: number | null;
			}>
		) => {
			setSubmissions((prev) =>
				prev.map((sub) =>
					sub.id === e.detail.id
						? {
								...sub,
								verdict: e.detail.verdict as SubmissionListItem["verdict"],
								score: e.detail.score ?? sub.score,
								executionTime: e.detail.executionTime,
								memoryUsed: e.detail.memoryUsed,
							}
						: sub
				)
			);
		};

		window.addEventListener("submission-judged", handler as EventListener);
		return () => window.removeEventListener("submission-judged", handler as EventListener);
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
						<TableRow key={sub.id} className={highlightId === sub.id ? "animate-highlight" : ""}>
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
		</div>
	);
}
