import type { Metadata } from "next";
import Link from "next/link";
import { getPracticeQuotaStatus, getPractices } from "@/actions/practices";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PracticeListTable } from "@/components/practices/practice-list-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "연습" }]} />
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-2xl">연습 목록</CardTitle>
					{session?.user && (
						<Button asChild disabled={!canCreate}>
							<Link href={canCreate ? "/practices/new" : "#"}>연습 만들기</Link>
						</Button>
					)}
				</CardHeader>
				<CardContent>
					{quota && !quota.canCreate && !isAdmin && (
						<p className="text-sm text-muted-foreground mb-4">
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
		</div>
	);
}
