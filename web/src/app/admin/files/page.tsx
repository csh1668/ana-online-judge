import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { FileManager } from "./file-manager";

export const metadata: Metadata = {
	title: "파일 관리",
};

export default function AdminFilesPage() {
	return (
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "파일" }]} />
			<div>
				<h1 className="text-3xl font-bold">파일 관리</h1>
				<p className="text-muted-foreground mt-2">업로드된 이미지와 파일을 관리합니다.</p>
			</div>

			<FileManager />
		</div>
	);
}
