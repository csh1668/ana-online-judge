import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContestById, isUserRegistered } from "@/actions/contests";
import { getSubmissions, type SubmissionListItem } from "@/actions/submissions";
import { auth } from "@/auth";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const contestId = Number.parseInt(id, 10);
	const contest = await getContestById(contestId);

	if (!contest) {
		return {
			title: "대회를 찾을 수 없습니다",
		};
	}

	return {
		title: `${contest.title} - 내 제출`,
		description: `${contest.title} 대회에서 내가 제출한 코드를 확인하세요`,
	};
}

export default async function ContestMySubmissionsPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ page?: string }>;
}) {
	const { id } = await params;
	const contestId = Number.parseInt(id, 10);
	const contest = await getContestById(contestId);

	if (!contest) {
		notFound();
	}

	const session = await auth();
	if (!session?.user?.id) {
		notFound();
	}

	const userId = parseInt(session.user.id, 10);
	const isRegistered = await isUserRegistered(contestId, userId);

	if (!isRegistered) {
		notFound();
	}

	const params2 = await searchParams;
	const page = parseInt(params2.page || "1", 10);
	const { submissions, total } = await getSubmissions({
		page,
		limit: 20,
		userId,
		contestId,
	});
	const totalPages = Math.ceil(total / 20);

	const isAdmin = session?.user?.role === "admin";
	const canDownload = isAdmin || userId !== null;

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-2xl">{contest.title} - 내 제출</CardTitle>
							<CardDescription>
								이 대회에서 내가 제출한 총 {total}개의 코드가 있습니다
							</CardDescription>
						</div>
						<Link
							href={`/contests/${contestId}`}
							className="text-sm text-muted-foreground hover:text-primary transition-colors"
						>
							← 대회로 돌아가기
						</Link>
					</div>
				</CardHeader>
				<CardContent>
					{submissions.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">제출 내역이 없습니다.</div>
					) : (
						<>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<SubmissionTableHeader isAdmin={isAdmin} canDownload={canDownload} />
									</TableHeader>
									<TableBody>
										{submissions.map((submission: SubmissionListItem) => (
											<SubmissionRow
												key={submission.id}
												submission={submission}
												isAdmin={isAdmin}
												currentUserId={userId}
											/>
										))}
									</TableBody>
								</Table>
							</div>

							{/* Pagination */}
							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 mt-6">
									{page > 1 && (
										<Link
											href={`/contests/${contestId}/my-submissions?page=${page - 1}`}
											className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
										>
											이전
										</Link>
									)}
									<span className="text-sm text-muted-foreground">
										{page} / {totalPages}
									</span>
									{page < totalPages && (
										<Link
											href={`/contests/${contestId}/my-submissions?page=${page + 1}`}
											className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
										>
											다음
										</Link>
									)}
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
