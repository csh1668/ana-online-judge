import type { Metadata } from "next";
import { ContestForm } from "@/components/contests/contest-form";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "새 대회 만들기",
	description: "새로운 대회를 생성합니다",
};

export default function NewContestPage() {
	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "대회", href: "/admin/contests" },
				{ label: "새 대회" },
			]}
		>
			<Card>
				<PageHeader title="새 대회 만들기" />
				<CardContent>
					<ContestForm />
				</CardContent>
			</Card>
		</PageShell>
	);
}
