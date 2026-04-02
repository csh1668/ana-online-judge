"use server";

import { requireAdmin } from "@/lib/auth-utils";
import {
	deleteUploadedFile as _deleteUploadedFile,
	getAllUploadedFiles as _getAllUploadedFiles,
} from "@/lib/services/files";

export async function getAllUploadedFiles() {
	await requireAdmin();
	return _getAllUploadedFiles();
}

export async function deleteUploadedFile(key: string) {
	await requireAdmin();
	return _deleteUploadedFile(key);
}

export type GetAllUploadedFilesReturn = Awaited<ReturnType<typeof getAllUploadedFiles>>;
export type DeleteUploadedFileReturn = Awaited<ReturnType<typeof deleteUploadedFile>>;
