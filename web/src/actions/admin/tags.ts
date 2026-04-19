"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import { enqueue } from "@/lib/queue/rating-queue";
import {
	createTag,
	deleteTag,
	listChildren,
	listRootTags,
	updateTag,
} from "@/lib/services/algorithm-tags";
import { listProblemIdsAffectedByTags } from "@/lib/services/problem-vote-tags";
import { getDescendantIds } from "@/lib/tags/tree-queries";

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
