import { listRootSources } from "@/lib/services/sources";
import { SourcesTreeManager } from "./sources-tree-manager";

export default async function AdminSourcesPage() {
	const roots = await listRootSources();
	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-bold">출처 관리</h1>
			<SourcesTreeManager initialRoots={roots} />
		</div>
	);
}
