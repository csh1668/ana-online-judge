import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUpdateNote } from "@/actions/update-notes";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { UpdateNoteForm } from "@/components/update-notes/update-note-form";

export const metadata: Metadata = {
	title: "업데이트 내역 편집",
	description: "업데이트 내역을 수정합니다",
};

export default async function EditUpdateNotePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const note = await getUpdateNote(Number.parseInt(id, 10));
	if (!note) notFound();

	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "업데이트 내역", href: "/admin/updates" },
				{ label: note.title },
				{ label: "편집" },
			]}
		>
			<Card>
				<PageHeader title="업데이트 내역 편집" />
				<CardContent>
					<UpdateNoteForm mode="edit" note={note} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
