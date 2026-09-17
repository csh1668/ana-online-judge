import { listRootSources } from "@/actions/sources";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { SourcesTreeManager } from "./sources-tree-manager";

export default async function AdminSourcesPage() {
	const roots = await listRootSources();
	return (
		<PageShell width="fluid" breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "출처" }]}>
			<Card>
				<PageHeader title="출처 관리" />
				<CardContent>
					<SourcesTreeManager initialRoots={roots} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
