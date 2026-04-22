"use client";

import { useEffect, useRef } from "react";
import type { SubmissionListItem } from "@/actions/submissions";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

interface MySubmissionsProps {
	problemId: number;
	submissions: SubmissionListItem[];
	highlightSubmissionId?: number | null;
	currentUserId?: number | null;
	isAdmin?: boolean;
}

export function MySubmissions({
	problemId: _problemId,
	submissions,
	highlightSubmissionId = null,
	currentUserId = null,
	isAdmin = false,
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
			<div ref={sectionRef} className="text-center py-12 text-muted-foreground">
				제출 내역이 없습니다.
			</div>
		);
	}

	return (
		<div ref={sectionRef} className="rounded-md border">
			<Table className="min-w-[1040px]">
				<TableHeader>
					<SubmissionTableHeader
						isAdmin={isAdmin}
						canDownload={currentUserId !== null || isAdmin}
					/>
				</TableHeader>
				<TableBody>
					{submissions.map((sub) => (
						<SubmissionRow
							key={sub.id}
							submission={sub}
							isAdmin={isAdmin}
							currentUserId={currentUserId}
							highlight={highlightSubmissionId === sub.id}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
