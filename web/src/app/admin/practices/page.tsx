import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPractices } from "@/actions/practices";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { PracticeListTable } from "@/components/practices/practice-list-table";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";

export const metadata: Metadata = { title: "관리자 - 연습" };

export default async function AdminPracticesPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const session = await auth();
	if (session?.user?.role !== "admin") redirect("/");

	const sp = await searchParams;
	const page = Number.parseInt(sp.page || "1", 10);
	const { practices: list, total } = await getPractices({ page, limit: 30 });
	const totalPages = Math.ceil(total / 30);

	return (
		<PageShell width="fluid" breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "연습" }]}>
			<Card>
				<PageHeader title="연습 관리" />
				<CardContent>
					<PracticeListTable practices={list} />
					{list.length > 0 && (
						<PaginationLinks
							currentPage={page}
							totalPages={totalPages}
							buildHref={(p) => `/admin/practices?page=${p}`}
						/>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
