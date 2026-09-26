import Link from "next/link";
import type { SubmissionListItem } from "@/actions/submissions";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody } from "@/components/ui/table";

export function ProfileSubmissions({
	submissions,
	total,
	page,
	isAdmin,
	currentUserId,
	languageLabels,
}: {
	submissions: SubmissionListItem[];
	total: number;
	page: number;
	isAdmin: boolean;
	currentUserId: number | null;
	languageLabels: Record<string, string>;
}) {
	const totalPages = Math.ceil(total / 20);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">최근 제출</CardTitle>
			</CardHeader>
			<CardContent>
				{submissions.length === 0 ? (
					<EmptyState>제출 기록이 없습니다</EmptyState>
				) : (
					<>
						<Table className="min-w-[1060px]">
							<thead>
								<SubmissionTableHeader showDetail={false} />
							</thead>
							<TableBody>
								{submissions.map((submission) => (
									<SubmissionRow
										key={submission.id}
										submission={submission}
										showDetail={false}
										isAdmin={isAdmin}
										currentUserId={currentUserId}
										languageLabels={languageLabels}
									/>
								))}
							</TableBody>
						</Table>
						{totalPages > 1 && (
							<div className="flex justify-center gap-2 mt-4">
								{page > 1 && (
									<Button variant="outline" size="sm" asChild>
										<Link href={`?page=${page - 1}`}>이전</Link>
									</Button>
								)}
								<span className="flex items-center text-sm text-muted-foreground">
									{page} / {totalPages}
								</span>
								{page < totalPages && (
									<Button variant="outline" size="sm" asChild>
										<Link href={`?page=${page + 1}`}>다음</Link>
									</Button>
								)}
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
