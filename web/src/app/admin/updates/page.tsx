import type { Metadata } from "next";
import { getUpdateNotes } from "@/actions/update-notes";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { UpdateNotesManager } from "./_components/update-notes-manager";

export const metadata: Metadata = {
	title: "업데이트 내역 관리",
	description: "업데이트 내역을 추가·수정·삭제합니다",
};

export default async function AdminUpdateNotesPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const sp = await searchParams;
	const page = Math.max(1, Number.parseInt(sp.page || "1", 10) || 1);
	const { items, total } = await getUpdateNotes({ page, limit: 20 });

	return (
		<PageShell
			width="fluid"
			breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "업데이트 내역" }]}
		>
			<Card>
				<PageHeader title="업데이트 내역 관리" description={`총 ${total}개의 업데이트 내역`} />
			</Card>
			<UpdateNotesManager
				notes={items}
				currentPage={page}
				totalPages={Math.max(1, Math.ceil(total / 20))}
			/>
		</PageShell>
	);
}
