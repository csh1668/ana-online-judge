"use client";

import { useState, useTransition } from "react";
import type { SubmissionListItem } from "@/actions/submissions";
import { getSubmissions } from "@/actions/submissions";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

interface AllSubmissionsProps {
	problemId: number;
	initialSubmissions: SubmissionListItem[];
	initialTotal: number;
	currentUserId?: number | null;
	isAdmin?: boolean;
	contestId?: number;
}

export function AllSubmissions({
	problemId,
	initialSubmissions,
	initialTotal,
	currentUserId = null,
	isAdmin = false,
	contestId,
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
				contestId,
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
		return <div className="text-center py-12 text-muted-foreground">제출 내역이 없습니다.</div>;
	}

	return (
		<div>
			<div className="rounded-md border">
				<Table>
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
							/>
						))}
					</TableBody>
				</Table>
			</div>

			<PaginationLinks
				currentPage={page}
				totalPages={totalPages}
				onPageChange={loadPage}
				disabled={isPending}
			/>
		</div>
	);
}
