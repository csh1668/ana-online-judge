import Link from "next/link";
import type { SubmissionListItem } from "@/actions/submissions";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody } from "@/components/ui/table";

export function ProfileSubmissions({
	submissions,
	total,
	page,
	isAdmin,
	currentUserId,
}: {
	submissions: SubmissionListItem[];
	total: number;
	page: number;
	isAdmin: boolean;
	currentUserId: number | null;
}) {
	const totalPages = Math.ceil(total / 20);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">최근 제출</CardTitle>
			</CardHeader>
			<CardContent>
				{submissions.length === 0 ? (
					<p className="text-muted-foreground text-sm text-center py-8">제출 기록이 없습니다</p>
				) : (
					<>
						<div className="overflow-x-auto">
							<Table className="min-w-[1000px]">
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
										/>
									))}
								</TableBody>
							</Table>
						</div>
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
