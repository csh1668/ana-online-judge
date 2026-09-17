import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { FileManager } from "./file-manager";

export const metadata: Metadata = {
	title: "파일 관리",
};

export default function AdminFilesPage() {
	return (
		<PageShell width="fluid" breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "파일" }]}>
			<Card>
				<PageHeader
					title="파일 관리"
					description="MinIO 스토리지의 모든 파일을 탐색하고 관리합니다."
				/>
			</Card>

			<FileManager />
		</PageShell>
	);
}
