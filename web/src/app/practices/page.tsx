import type { Metadata } from "next";
import Link from "next/link";
import { getPracticeQuotaStatus, getPractices } from "@/actions/practices";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { PracticeListTable } from "@/components/practices/practice-list-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";

export const metadata: Metadata = {
	title: "연습",
	description: "누구나 만들 수 있는 미니 대회",
};

export default async function PracticesPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const sp = await searchParams;
	const page = Number.parseInt(sp.page || "1", 10);
	const session = await auth();
	const [{ practices: list, total }, quota] = await Promise.all([
		getPractices({ page, limit: 20 }),
		session?.user?.id ? getPracticeQuotaStatus() : Promise.resolve(null),
	]);
	const totalPages = Math.ceil(total / 20);
	const isAdmin = session?.user?.role === "admin";
	const canCreate = !!session?.user && (isAdmin || quota?.canCreate);

	return (
		<PageShell breadcrumb={[{ label: "연습" }]}>
			<Card>
				<PageHeader
					title="연습 목록"
					description="누구나 만들 수 있는 미니 대회"
					actions={
						session?.user ? (
							<Button asChild disabled={!canCreate}>
								<Link href={canCreate ? "/practices/new" : "#"}>새 연습</Link>
							</Button>
						) : undefined
					}
				/>
				<CardContent>
					{quota && !quota.canCreate && !isAdmin && (
						<p className="mb-4 text-sm text-muted-foreground">
							{quota.reason === "daily_limit" && "오늘은 이미 연습을 만드셨습니다 (하루 1개 제한)."}
							{quota.reason === "active_limit" && "현재 진행 중이거나 예정된 연습이 있습니다."}
							{quota.reason === "contest_only_account" && "이 계정은 연습을 만들 수 없습니다."}
						</p>
					)}
					<PracticeListTable practices={list} />
					{list.length > 0 && (
						<PaginationLinks
							currentPage={page}
							totalPages={totalPages}
							buildHref={(p) => `/practices?page=${p}`}
						/>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
