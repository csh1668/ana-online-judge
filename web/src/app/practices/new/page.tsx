import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPracticeQuotaStatus } from "@/actions/practices";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { PracticeForm } from "@/components/practices/practice-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "연습 만들기",
};

export default async function NewPracticePage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const isAdmin = session.user.role === "admin";
	if (!isAdmin) {
		const quota = await getPracticeQuotaStatus();
		if (!quota?.canCreate) redirect("/practices");
	}

	return (
		<PageShell
			width="narrow"
			breadcrumb={[{ label: "연습", href: "/practices" }, { label: "새 연습" }]}
		>
			<Card>
				<PageHeader
					title="새 연습"
					description="시작·종료 시간과 문제를 골라 미니 대회를 만듭니다"
				/>
				<CardContent>
					<PracticeForm />
				</CardContent>
			</Card>
		</PageShell>
	);
}
