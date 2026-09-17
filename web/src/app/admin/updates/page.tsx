import type { Metadata } from "next";
import { getUpdateNotes } from "@/actions/update-notes";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { UpdateNotesManager } from "./_components/update-notes-manager";

export const metadata: Metadata = {
	title: "업데이트 노트 관리",
	description: "업데이트 노트를 추가·수정·삭제합니다",
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
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "업데이트 노트" }]} />
			<div>
				<h1 className="text-3xl font-bold">업데이트 노트 관리</h1>
				<p className="text-muted-foreground mt-2">총 {total}개의 업데이트 노트</p>
			</div>
			<UpdateNotesManager
				notes={items}
				currentPage={page}
				totalPages={Math.max(1, Math.ceil(total / 20))}
			/>
		</div>
	);
}
