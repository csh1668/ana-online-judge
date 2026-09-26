import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { listLanguagesAction } from "@/actions/admin/languages";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageTable } from "./_components/language-table";

export const metadata: Metadata = {
	title: "언어 관리",
	description: "채점 언어를 추가·수정하고 툴체인을 설치합니다",
};

export const dynamic = "force-dynamic";

export default async function AdminLanguagesPage({
	searchParams,
}: {
	searchParams: Promise<{ deleted?: string }>;
}) {
	const sp = await searchParams;
	const showDeleted = sp.deleted === "1";
	const rows = await listLanguagesAction({ includeDeleted: showDeleted });

	return (
		<PageShell
			width="fluid"
			breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "언어 관리" }]}
		>
			<Card>
				<PageHeader
					title="언어 관리"
					description={`총 ${rows.length}개`}
					actions={
						<>
							<Button variant="outline" asChild>
								<Link href={showDeleted ? "/admin/languages" : "/admin/languages?deleted=1"}>
									{showDeleted ? "삭제됨 숨기기" : "삭제됨 보기"}
								</Link>
							</Button>
							<Button asChild>
								<Link href="/admin/languages/new">
									<Plus className="mr-2 h-4 w-4" />
									언어 추가
								</Link>
							</Button>
						</>
					}
				/>
				<CardContent>
					<LanguageTable rows={rows} showDeleted={showDeleted} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
