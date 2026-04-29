import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPracticeQuotaStatus } from "@/actions/practices";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PracticeForm } from "@/components/practices/practice-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
		<div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "연습", href: "/practices" }, { label: "만들기" }]} />
			<Card>
				<CardHeader>
					<CardTitle>연습 만들기</CardTitle>
				</CardHeader>
				<CardContent>
					<PracticeForm />
				</CardContent>
			</Card>
		</div>
	);
}
