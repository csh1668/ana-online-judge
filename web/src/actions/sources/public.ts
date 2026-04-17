"use server";

import * as sourcesService from "@/lib/services/sources";

export async function publicListChildren(parentId: number | null) {
	return parentId === null
		? sourcesService.listRootSources()
		: sourcesService.listChildren(parentId);
}

export async function publicSearchSources(query: string) {
	return sourcesService.searchSources(query);
}

export async function publicGetBreadcrumb(id: number) {
	return sourcesService.getBreadcrumb(id);
}
