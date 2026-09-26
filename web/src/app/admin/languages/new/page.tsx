import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageForm } from "../_components/language-form";

export const metadata: Metadata = {
	title: "새 언어",
	description: "채점 언어를 추가합니다",
};

export default function NewLanguagePage() {
	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "언어 관리", href: "/admin/languages" },
				{ label: "새 언어" },
			]}
		>
			<Card>
				<PageHeader title="새 언어" />
				<CardContent>
					<LanguageForm mode="create" />
				</CardContent>
			</Card>
		</PageShell>
	);
}
