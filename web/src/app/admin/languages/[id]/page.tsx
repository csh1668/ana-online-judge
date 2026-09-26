import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLanguageAction } from "@/actions/admin/languages";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallPanel } from "../_components/install-panel";
import { InstallStateBadge } from "../_components/install-state-badge";
import { LanguageDangerZone } from "../_components/language-danger-zone";
import { LanguageForm } from "../_components/language-form";

export const metadata: Metadata = {
	title: "언어 편집",
	description: "채점 언어 설정과 툴체인 설치를 관리합니다",
};

export const dynamic = "force-dynamic";

export default async function AdminLanguageDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const row = await getLanguageAction(id);
	if (!row) notFound();

	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "언어 관리", href: "/admin/languages" },
				{ label: row.label },
			]}
		>
			<Card>
				<PageHeader
					title={row.label}
					meta={<InstallStateBadge row={row} />}
					description={<span className="font-mono text-xs">{row.id}</span>}
				/>
				<CardContent>
					<LanguageForm mode="edit" language={row} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>설치</CardTitle>
				</CardHeader>
				<CardContent>
					<InstallPanel row={row} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>위험 구역</CardTitle>
				</CardHeader>
				<CardContent>
					<LanguageDangerZone id={row.id} label={row.label} deleted={row.deletedAt !== null} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
