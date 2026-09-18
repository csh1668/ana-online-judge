import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyNotifications } from "@/actions/notifications";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getSessionInfo } from "@/lib/auth-utils";
import { NotificationsList } from "./notifications-list";

export const metadata: Metadata = {
	title: "알림",
};

export default async function NotificationsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const { userId } = await getSessionInfo();
	if (userId === null) redirect("/login");

	const { page } = await searchParams;
	const pageNum = Math.max(1, Number(page) || 1);
	const { items, total } = await getMyNotifications(pageNum);
	const totalPages = Math.ceil(total / 20);

	return (
		<PageShell breadcrumb={[{ label: "알림" }]}>
			<Card>
				<PageHeader title="알림" />
				<CardContent className="p-0">
					<NotificationsList initial={items} />
				</CardContent>
			</Card>
			{items.length > 0 && (
				<PaginationLinks
					currentPage={pageNum}
					totalPages={totalPages}
					buildHref={(p) => `/notifications?page=${p}`}
				/>
			)}
		</PageShell>
	);
}
