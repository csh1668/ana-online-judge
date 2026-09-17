import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpdateNoteForm } from "@/components/update-notes/update-note-form";

export const metadata: Metadata = {
	title: "새 업데이트 노트",
	description: "업데이트 노트를 작성합니다",
};

export default function NewUpdateNotePage() {
	return (
		<div className="space-y-6">
			<PageBreadcrumb
				items={[
					{ label: "관리자", href: "/admin" },
					{ label: "업데이트 노트", href: "/admin/updates" },
					{ label: "새 노트" },
				]}
			/>
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">새 업데이트 노트</CardTitle>
				</CardHeader>
				<CardContent>
					<UpdateNoteForm mode="create" />
				</CardContent>
			</Card>
		</div>
	);
}
