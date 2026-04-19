import type { Metadata } from "next";
import { listRootTags } from "@/lib/services/algorithm-tags";
import { TagsTreeManager } from "./tags-tree-manager";

export const metadata: Metadata = {
	title: "알고리즘 태그 관리",
};

export default async function AdminTagsPage() {
	const roots = await listRootTags();
	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-bold">알고리즘 태그 관리</h1>
			<TagsTreeManager initialRoots={roots} />
		</div>
	);
}
