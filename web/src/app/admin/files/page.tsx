import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { FileManager } from "./file-manager";

export const metadata: Metadata = {
	title: "파일 관리",
};

export default function AdminFilesPage() {
	return (
		<div className="space-y-4">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "파일" }]} />
			<div>
				<h1 className="text-3xl font-bold">파일 관리</h1>
				<p className="text-muted-foreground mt-1">
					MinIO 스토리지의 모든 파일을 탐색하고 관리합니다.
				</p>
			</div>

			<FileManager />
		</div>
	);
}
