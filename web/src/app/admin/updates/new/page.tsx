import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { UpdateNoteForm } from "@/components/update-notes/update-note-form";

export const metadata: Metadata = {
	title: "새 업데이트 내역",
	description: "업데이트 내역을 작성합니다",
};

export default function NewUpdateNotePage() {
	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "업데이트 내역", href: "/admin/updates" },
				{ label: "새 업데이트" },
			]}
		>
			<Card>
				<PageHeader title="새 업데이트 내역" />
				<CardContent>
					<UpdateNoteForm mode="create" />
				</CardContent>
			</Card>
		</PageShell>
	);
}
