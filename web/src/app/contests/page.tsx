import type { Metadata } from "next";
import { getContests } from "@/actions/contests";
import { ContestListTable } from "@/components/contests/contest-list-table";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";

export const metadata: Metadata = {
	title: "대회 목록",
	description: "진행 중인 대회와 예정된 대회를 확인하세요",
};

export default async function ContestsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = Number.parseInt(params.page || "1", 10);
	const { contests: contestsList, total } = await getContests({ page, limit: 20 });
	const totalPages = Math.ceil(total / 20);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "대회" }]} />
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">대회 목록</CardTitle>
				</CardHeader>
				<CardContent>
					<ContestListTable contests={contestsList} />
					{contestsList.length > 0 && (
						<PaginationLinks
							currentPage={page}
							totalPages={totalPages}
							buildHref={(p) => `/contests?page=${p}`}
						/>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
