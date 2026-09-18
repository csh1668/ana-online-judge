import type { Metadata } from "next";
import { listRootTags } from "@/actions/tags";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { TagsTreeManager } from "./tags-tree-manager";

export const metadata: Metadata = {
	title: "알고리즘 태그 관리",
};

export default async function AdminTagsPage() {
	const roots = await listRootTags();
	return (
		<PageShell
			width="fluid"
			breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "알고리즘 태그" }]}
		>
			<Card>
				<PageHeader title="알고리즘 태그 관리" />
				<CardContent>
					<TagsTreeManager initialRoots={roots} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
