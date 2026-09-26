import type { Metadata } from "next";
import { getAdminLanguageOptions } from "@/actions/admin/languages";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { ProblemForm } from "../problem-form";

export const metadata: Metadata = {
	title: "새 문제 만들기",
};

export default async function NewProblemPage() {
	const languages = await getAdminLanguageOptions();
	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "문제", href: "/admin/problems" },
				{ label: "새 문제" },
			]}
		>
			<Card>
				<PageHeader title="새 문제 만들기" description="새로운 문제를 추가합니다." />
			</Card>

			<ProblemForm languages={languages} />
		</PageShell>
	);
}
