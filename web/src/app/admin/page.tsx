import { CheckCircle, FileText, Send, Users } from "lucide-react";
import type { Metadata } from "next";
import { getAdminDashboardStats } from "@/actions/admin/queries";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "관리자 대시보드",
};

export default async function AdminDashboardPage() {
	const counts = await getAdminDashboardStats();

	const stats = [
		{ title: "총 사용자", value: counts.users, icon: Users },
		{ title: "총 문제", value: counts.problems, icon: FileText },
		{ title: "총 제출", value: counts.submissions, icon: Send },
		{ title: "정답 제출", value: counts.accepted, icon: CheckCircle },
	];

	return (
		<PageShell width="fluid" breadcrumb={[{ label: "관리자" }]}>
			<Card>
				<PageHeader title="대시보드" description="AOJ 관리자 대시보드입니다." />
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						{stats.map((stat) => (
							<div
								key={stat.title}
								className="flex items-center justify-between rounded-[2px] border border-border p-4"
							>
								<div>
									<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
										{stat.title}
									</p>
									<p className="mt-1 font-mulmaru text-3xl font-extrabold tabular-nums">
										{stat.value}
									</p>
								</div>
								<stat.icon className="size-5 text-accent" />
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
