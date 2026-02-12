import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSubmissions } from "@/actions/submissions";
import { auth } from "@/auth";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
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
	searchParams: Promise<{
		page?: string;
		me?: string;
		username?: string;
		verdict?: string;
		language?: string;
		sort?: "id" | "executionTime" | "memoryUsed" | "createdAt";
		order?: "asc" | "desc";
	}>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const me = params.me === "true";

	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	// Admin이 아닌 경우, 대회 제출은 제외하고 본인 제출과 일반 제출만 표시
	// userId를 설정하지 않으면 DB에서 모든 제출을 가져온 후 필터링하므로,
	// 본인 제출(대회 포함)과 일반 제출을 모두 볼 수 있음
	let userId: number | undefined;
	if (me) {
		// me 파라미터가 있으면 본인 제출만 보여줌
		if (currentUserId) {
			userId = currentUserId;
		}
	}
	// me 파라미터가 없고 admin이 아니면 userId를 설정하지 않아서 필터링에서 처리

	const { submissions, total } = await getSubmissions({
		page,
		limit: 20,
		userId,
		excludeContestSubmissions: !isAdmin, // Admin이 아니면 대회 제출 제외 (본인 제출은 포함)
		username: params.username,
		verdict: params.verdict,
		language: params.language,
		sort: params.sort,
		order: params.order,
	});
	const totalPages = Math.ceil(total / 20);
	const canDownload = isAdmin || currentUserId !== null;

	// Build query string for pagination
	const queryParams = new URLSearchParams();
	if (page) queryParams.set("page", page.toString()); // Will be overwritten in pagination links
	if (me) queryParams.set("me", "true");
	if (params.username) queryParams.set("username", params.username);
	if (params.verdict) queryParams.set("verdict", params.verdict);
	if (params.language) queryParams.set("language", params.language);
	if (params.sort) queryParams.set("sort", params.sort);
	if (params.order) queryParams.set("order", params.order);

	const getPageLink = (newPage: number) => {
		const newParams = new URLSearchParams(queryParams);
		newParams.set("page", newPage.toString());
		return `/submissions?${newParams.toString()}`;
	};

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-6">
					<div>
						<CardTitle className="text-2xl">{me ? "내 제출 현황" : "제출 현황"}</CardTitle>
						<CardDescription>
							{me
								? `내가 제출한 총 ${total}개의 코드가 있습니다`
								: `총 ${total}개의 제출이 있습니다`}
						</CardDescription>
					</div>
					<Suspense>
						<SubmissionFilters />
					</Suspense>
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
										{submissions.map((submission) => (
											<SubmissionRow
												key={submission.id}
												submission={submission}
												isAdmin={isAdmin}
												currentUserId={currentUserId}
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
											href={getPageLink(page - 1)}
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
											href={getPageLink(page + 1)}
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
