import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUpdateNote } from "@/actions/update-notes";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpdateNoteForm } from "@/components/update-notes/update-note-form";

export const metadata: Metadata = {
	title: "업데이트 노트 편집",
	description: "업데이트 노트를 수정합니다",
};

export default async function EditUpdateNotePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const note = await getUpdateNote(Number.parseInt(id, 10));
	if (!note) notFound();

	return (
		<div className="space-y-6">
			<PageBreadcrumb
				items={[
					{ label: "관리자", href: "/admin" },
					{ label: "업데이트 노트", href: "/admin/updates" },
					{ label: note.title },
					{ label: "편집" },
				]}
			/>
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">업데이트 노트 편집</CardTitle>
				</CardHeader>
				<CardContent>
					<UpdateNoteForm mode="edit" note={note} />
				</CardContent>
			</Card>
		</div>
	);
}
