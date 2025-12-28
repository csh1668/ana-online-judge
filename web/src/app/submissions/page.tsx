import type { Metadata } from "next";
import Link from "next/link";
import { getSubmissions } from "@/actions/submissions";
import { auth } from "@/auth";
import { SubmissionRow, SubmissionTableHeader } from "@/components/submissions/submission-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

export const metadata: Metadata = {
	title: "제출 현황",
	description: "모든 제출 현황을 확인하세요",
};

export default async function SubmissionsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string; me?: string }>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const me = params.me === "true";

	let userId: number | undefined;
	if (me) {
		const session = await auth();
		if (session?.user?.id) {
			userId = parseInt(session.user.id, 10);
		}
	}

	const { submissions, total } = await getSubmissions({ page, limit: 20, userId });
	const totalPages = Math.ceil(total / 20);

	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">{me ? "내 제출 현황" : "제출 현황"}</CardTitle>
					<CardDescription>
						{me ? `내가 제출한 총 ${total}개의 코드가 있습니다` : `총 ${total}개의 제출이 있습니다`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{submissions.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">제출 내역이 없습니다.</div>
					) : (
						<>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<SubmissionTableHeader isAdmin={isAdmin} />
									</TableHeader>
									<TableBody>
										{submissions.map((submission) => (
											<SubmissionRow key={submission.id} submission={submission} isAdmin={isAdmin} />
										))}
									</TableBody>
								</Table>
							</div>

							{/* Pagination */}
							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 mt-6">
									{page > 1 && (
										<Link
											href={`/submissions?page=${page - 1}`}
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
											href={`/submissions?page=${page + 1}`}
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
