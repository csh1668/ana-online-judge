"use server";

import { revalidatePath } from "next/cache";
import type { TagNode } from "@/components/tags/tag-tree-select";
import { requireAdmin } from "@/lib/auth-utils";
import { enqueue } from "@/lib/queue/rating-queue";
import {
	createTag,
	deleteTag,
	listAllTags,
	listChildren,
	listRootTags,
	searchTags as searchTagsService,
	updateTag,
} from "@/lib/services/algorithm-tags";
import { listProblemIdsAffectedByTags } from "@/lib/services/problem-vote-tags";
import { getAncestorChain, getDescendantIds } from "@/lib/tags/tree-queries";

export async function listRootTagsAction() {
	await requireAdmin();
	return listRootTags();
}

export async function listChildrenAction(parentId: number) {
	await requireAdmin();
	return listChildren(parentId);
}

export async function createTagAction(input: {
	parentId: number | null;
	slug: string;
	name: string;
	description: string | null;
}) {
	const user = await requireAdmin();
	const userId = parseInt(user.id, 10);
	const result = await createTag({ ...input, userId });
	revalidatePath("/admin/tags");
	revalidatePath("/tags");
	return result;
}

export async function updateTagAction(
	id: number,
	input: {
		parentId?: number | null;
		slug?: string;
		name?: string;
		description?: string | null;
	}
) {
	const user = await requireAdmin();
	const userId = parseInt(user.id, 10);
	const result = await updateTag(id, { ...input, userId });
	revalidatePath("/admin/tags");
	revalidatePath("/tags");
	revalidatePath(`/tags/${id}`);
	return result;
}

export async function deleteTagAction(id: number) {
	await requireAdmin();
	const descendantIds = await getDescendantIds(id);
	const affectedProblemIds = await listProblemIdsAffectedByTags(descendantIds);

	await deleteTag(id);

	for (const problemId of affectedProblemIds) {
		enqueue({ kind: "recomputeProblemTags", problemId });
	}

	revalidatePath("/admin/tags");
	revalidatePath("/tags");
	return { affectedProblemCount: affectedProblemIds.length };
}

export async function listAdminTagChildrenAction(parentId: number | null): Promise<TagNode[]> {
	await requireAdmin();
	const rows = parentId === null ? await listRootTags() : await listChildren(parentId);
	return rows.map((r) => ({
		id: r.id,
		parentId: r.parentId,
		slug: r.slug,
		name: r.name,
	}));
}

export async function listAllAdminTagsAction(): Promise<TagNode[]> {
	await requireAdmin();
	const rows = await listAllTags();
	return rows.map((r) => ({
		id: r.id,
		parentId: r.parentId,
		slug: r.slug,
		name: r.name,
	}));
}

export async function searchAdminTagsAction(query: string): Promise<TagNode[]> {
	await requireAdmin();
	const rows = await searchTagsService(query, 30);
	return rows.map((r) => ({
		id: r.id,
		parentId: r.parentId,
		slug: r.slug,
		name: r.name,
	}));
}

export async function getTagBreadcrumbAction(id: number): Promise<TagNode[]> {
	await requireAdmin();
	const chain = await getAncestorChain(id);
	return chain.map((c) => ({
		id: c.id,
		parentId: c.parentId,
		slug: c.slug,
		name: c.name,
	}));
}

export async function previewDeleteTagImpactAction(id: number): Promise<{
	descendantCount: number;
	affectedProblemCount: number;
}> {
	await requireAdmin();
	const descendantIds = await getDescendantIds(id);
	if (descendantIds.length === 0) {
		return { descendantCount: 0, affectedProblemCount: 0 };
	}
	const affectedProblemIds = await listProblemIdsAffectedByTags(descendantIds);
	return {
		descendantCount: descendantIds.length - 1, // 자기 자신 제외
		affectedProblemCount: affectedProblemIds.length,
	};
}
