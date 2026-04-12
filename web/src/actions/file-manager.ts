"use server";

import { requireAdmin } from "@/lib/auth-utils";
import {
	createFolder as _createFolder,
	deleteEntry as _deleteEntry,
	deleteFolderRecursive as _deleteFolderRecursive,
	getFileContent as _getFileContent,
	getFilePreview as _getFilePreview,
	listDirectoryEntries as _listDirectoryEntries,
	updateFileContent as _updateFileContent,
	uploadFilesToPrefix as _uploadFilesToPrefix,
} from "@/lib/services/file-manager";

export async function listDirectoryEntries(...args: Parameters<typeof _listDirectoryEntries>) {
	await requireAdmin();
	return _listDirectoryEntries(...args);
}

export async function getFilePreview(...args: Parameters<typeof _getFilePreview>) {
	await requireAdmin();
	return _getFilePreview(...args);
}

export async function getFileContent(...args: Parameters<typeof _getFileContent>) {
	await requireAdmin();
	return _getFileContent(...args);
}

export async function updateFileContent(...args: Parameters<typeof _updateFileContent>) {
	await requireAdmin();
	return _updateFileContent(...args);
}

export async function createFolder(...args: Parameters<typeof _createFolder>) {
	await requireAdmin();
	return _createFolder(...args);
}

export async function deleteEntry(...args: Parameters<typeof _deleteEntry>) {
	await requireAdmin();
	return _deleteEntry(...args);
}

export async function deleteFolderRecursive(...args: Parameters<typeof _deleteFolderRecursive>) {
	await requireAdmin();
	return _deleteFolderRecursive(...args);
}

export async function uploadFiles(prefix: string, formData: FormData) {
	await requireAdmin();

	const entries = formData.getAll("files") as File[];
	const files = await Promise.all(
		entries.map(async (file) => ({
			name: file.name,
			content: Buffer.from(await file.arrayBuffer()),
			contentType: file.type || "application/octet-stream",
		}))
	);

	return _uploadFilesToPrefix(prefix, files);
}
