import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContestById, isUserContestOperator, isUserRegistered } from "@/actions/contests";
import { getSubmissions, type SubmissionListItem } from "@/actions/submissions";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
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
	const isAdmin = session?.user?.role === "admin";
	const [isRegistered, isOperator] = await Promise.all([
		isUserRegistered(contestId, userId),
		isUserContestOperator(contestId, userId),
	]);

	if (!isRegistered && !isOperator && !isAdmin) {
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

	const canDownload = isAdmin || userId !== null;

	return (
		<PageShell
			breadcrumb={[
				{ label: "대회", href: "/contests" },
				{ label: contest.title, href: `/contests/${contestId}` },
				{ label: "내 제출" },
			]}
		>
			<Card>
				<PageHeader
					title="내 제출"
					description={`이 대회에서 내가 제출한 총 ${total}개의 코드가 있습니다`}
				/>
				<CardContent>
					{submissions.length === 0 ? (
						<EmptyState>제출 내역이 없습니다.</EmptyState>
					) : (
						<>
							<Table className="min-w-[1060px]">
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

							<PaginationLinks
								currentPage={page}
								totalPages={totalPages}
								buildHref={(p) => `/contests/${contestId}/my-submissions?page=${p}`}
							/>
						</>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
