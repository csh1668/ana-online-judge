import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPractices } from "@/actions/practices";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PracticeListTable } from "@/components/practices/practice-list-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "연습" }]} />
			<Card>
				<CardHeader>
					<CardTitle>연습 관리</CardTitle>
				</CardHeader>
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
		</div>
	);
}
