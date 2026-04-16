import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopResource, workshopResources } from "@/db/schema";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import { workshopDraftResourcePath } from "@/lib/workshop/paths";

const MAX_RESOURCE_BYTES = 5 * 1024 * 1024; // 5MB per file

const NAME_PATTERN = /^[\w\-. ]{1,128}$/;
const RESERVED_BASENAMES = new Set(["main", "checker", "validator"]);

function assertTextContent(content: Buffer, name: string): void {
	const sample = content.subarray(0, 8192);
	if (sample.includes(0)) {
		throw new Error(`"${name}" is a binary file — workshop resources must be text`);
	}
}

function baseNameWithoutExt(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? name : name.slice(0, dot);
}

function assertValidName(name: string): void {
	if (!NAME_PATTERN.test(name)) {
		throw new Error(
			"리소스 파일명은 영문/숫자/언더바/하이픈/점/공백만 허용되며 1–128자여야 합니다"
		);
	}
	if (name === "." || name === "..") {
		throw new Error("사용할 수 없는 파일명입니다");
	}
	const base = baseNameWithoutExt(name);
	if (RESERVED_BASENAMES.has(base)) {
		throw new Error(
			`"${base}"은(는) 예약된 이름이므로 사용할 수 없습니다 (main, checker, validator)`
		);
	}
}

export async function listResourcesForDraft(draftId: number): Promise<WorkshopResource[]> {
	return db
		.select()
		.from(workshopResources)
		.where(eq(workshopResources.draftId, draftId))
		.orderBy(asc(workshopResources.name));
}

export async function getResource(
	resourceId: number,
	draftId: number
): Promise<WorkshopResource | null> {
	const [row] = await db
		.select()
		.from(workshopResources)
		.where(and(eq(workshopResources.id, resourceId), eq(workshopResources.draftId, draftId)))
		.limit(1);
	return row ?? null;
}

/**
 * Upload a resource. If a resource with the same name already exists in the draft,
 * overwrite the MinIO object and bump updatedAt on the existing row (preserves id).
 */
export async function uploadResource(params: {
	problemId: number;
	userId: number;
	draftId: number;
	name: string;
	content: Buffer;
}): Promise<WorkshopResource> {
	const { problemId, userId, draftId, name, content } = params;
	assertValidName(name);
	if (content.byteLength > MAX_RESOURCE_BYTES) {
		throw new Error("리소스 파일은 최대 5MB까지 업로드 가능합니다");
	}
	assertTextContent(content, name);
	const path = workshopDraftResourcePath(problemId, userId, name);
	await uploadFile(path, content, "application/octet-stream");

	const [existing] = await db
		.select()
		.from(workshopResources)
		.where(and(eq(workshopResources.draftId, draftId), eq(workshopResources.name, name)))
		.limit(1);
	if (existing) {
		const [updated] = await db
			.update(workshopResources)
			.set({ path, updatedAt: new Date() })
			.where(eq(workshopResources.id, existing.id))
			.returning();
		return updated;
	}
	const [created] = await db.insert(workshopResources).values({ draftId, name, path }).returning();
	return created;
}

/**
 * Rename a resource. Implements copy-then-delete at the storage layer.
 * Errors if the new name collides with another resource in the same draft.
 */
export async function renameResource(params: {
	problemId: number;
	userId: number;
	draftId: number;
	resourceId: number;
	newName: string;
}): Promise<WorkshopResource> {
	const { problemId, userId, draftId, resourceId, newName } = params;
	assertValidName(newName);

	const resource = await getResource(resourceId, draftId);
	if (!resource) throw new Error("리소스를 찾을 수 없습니다");
	if (resource.name === newName) return resource;

	const [collision] = await db
		.select({ id: workshopResources.id })
		.from(workshopResources)
		.where(and(eq(workshopResources.draftId, draftId), eq(workshopResources.name, newName)))
		.limit(1);
	if (collision) throw new Error("같은 이름의 리소스가 이미 존재합니다");

	const content = await downloadFile(resource.path);
	const newPath = workshopDraftResourcePath(problemId, userId, newName);
	await uploadFile(newPath, content, "application/octet-stream");
	await deleteFile(resource.path);

	const [updated] = await db
		.update(workshopResources)
		.set({ name: newName, path: newPath, updatedAt: new Date() })
		.where(eq(workshopResources.id, resourceId))
		.returning();
	return updated;
}

export async function deleteResource(draftId: number, resourceId: number): Promise<void> {
	const resource = await getResource(resourceId, draftId);
	if (!resource) throw new Error("리소스를 찾을 수 없습니다");
	await deleteFile(resource.path);
	await db.delete(workshopResources).where(eq(workshopResources.id, resourceId));
}

/**
 * Read back the contents of a resource file. Used by the preview UI for
 * text resources (testlib.h etc.).
 */
export async function readResourceContent(
	draftId: number,
	resourceId: number
): Promise<{ name: string; content: Buffer }> {
	const resource = await getResource(resourceId, draftId);
	if (!resource) throw new Error("리소스를 찾을 수 없습니다");
	const content = await downloadFile(resource.path);
	assertTextContent(content, resource.name);
	return { name: resource.name, content };
}
