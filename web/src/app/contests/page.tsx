import type { Metadata } from "next";
import { getContests } from "@/actions/contests";
import { ContestListTable } from "@/components/contests/contest-list-table";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
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
		<PageShell breadcrumb={[{ label: "대회" }]}>
			<Card>
				<PageHeader title="대회 목록" description="진행 중인 대회와 예정된 대회를 확인하세요" />
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
		</PageShell>
	);
}
