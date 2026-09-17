import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { ProblemSetForm } from "@/components/problem-sets/problem-set-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "문제집 만들기" };

export default async function NewProblemSetPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login?redirectTo=/problemsets/new");

	return (
		<PageShell
			width="narrow"
			breadcrumb={[{ label: "문제집", href: "/problemsets" }, { label: "새 문제집" }]}
		>
			<Card>
				<PageHeader title="새 문제집" />
				<CardContent>
					<ProblemSetForm mode="create" />
				</CardContent>
			</Card>
		</PageShell>
	);
}
