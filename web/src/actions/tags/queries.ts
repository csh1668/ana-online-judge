"use server";

import { getTag, searchTags as searchTagsService } from "@/lib/services/algorithm-tags";

export async function searchTagsAction(query: string) {
	return searchTagsService(query, 30);
}

export async function getTagsByIdsAction(ids: number[]) {
	const results = await Promise.all(ids.map((id) => getTag(id)));
	return results.filter((t): t is NonNullable<typeof t> => t !== null);
}
