import {
	deleteAllWithPrefix,
	deleteFile,
	downloadFile,
	listDirectory as storageListDirectory,
	uploadFile,
} from "@/lib/storage";
import { ensureBucket } from "@/lib/storage/client";

const TEXT_EXTENSIONS = new Set([
	".txt",
	".c",
	".cpp",
	".cc",
	".h",
	".hpp",
	".py",
	".rs",
	".java",
	".js",
	".ts",
	".tsx",
	".jsx",
	".toml",
	".json",
	".json5",
	".md",
	".yml",
	".yaml",
	".xml",
	".html",
	".css",
	".scss",
	".go",
	".sh",
	".bash",
	".zsh",
	".fish",
	".sql",
	".graphql",
	".env",
	".gitignore",
	".dockerfile",
	".makefile",
	".cfg",
	".ini",
	".conf",
	".log",
	".csv",
	".tsv",
]);

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".ico",
	".bmp",
]);

export type FileType = "text" | "image" | "binary";

export function getFileType(key: string): FileType {
	const ext = key.substring(key.lastIndexOf(".")).toLowerCase();
	if (TEXT_EXTENSIONS.has(ext)) return "text";
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	if (!key.includes(".") || ext === ".") return "text";
	return "binary";
}

function getFolderName(prefix: string): string {
	const parts = prefix.replace(/\/$/, "").split("/");
	return parts[parts.length - 1] || prefix;
}

function getFileName(key: string): string {
	return key.split("/").pop() || key;
}

export interface DirectoryEntry {
	folders: { prefix: string; name: string }[];
	files: { key: string; name: string; size: number; lastModified: Date; fileType: FileType }[];
}

export async function listDirectoryEntries(prefix: string): Promise<DirectoryEntry> {
	const result = await storageListDirectory(prefix);

	return {
		folders: result.folders.map((p) => ({ prefix: p, name: getFolderName(p) })),
		files: result.files.map((f) => ({
			key: f.key,
			name: getFileName(f.key),
			size: f.size,
			lastModified: f.lastModified,
			fileType: getFileType(f.key),
		})),
	};
}

const PREVIEW_MAX_LINES = 500;
const PREVIEW_MAX_BYTES = 512 * 1024;

export interface FilePreview {
	fileType: FileType;
	name: string;
	size: number;
	key: string;
	content?: string;
	totalLines?: number;
	truncated?: boolean;
	imageUrl?: string;
}

export async function getFilePreview(key: string): Promise<FilePreview> {
	const fileType = getFileType(key);
	const name = getFileName(key);

	if (fileType === "text") {
		const buffer = await downloadFile(key);
		const size = buffer.length;

		if (size > PREVIEW_MAX_BYTES) {
			const partial = buffer.subarray(0, PREVIEW_MAX_BYTES).toString("utf-8");
			const lines = partial.split("\n");
			return {
				fileType,
				name,
				size,
				key,
				content: lines.slice(0, PREVIEW_MAX_LINES).join("\n"),
				totalLines: lines.length,
				truncated: true,
			};
		}

		const text = buffer.toString("utf-8");
		const lines = text.split("\n");
		const truncated = lines.length > PREVIEW_MAX_LINES;

		return {
			fileType,
			name,
			size,
			key,
			content: truncated ? lines.slice(0, PREVIEW_MAX_LINES).join("\n") : text,
			totalLines: lines.length,
			truncated,
		};
	}

	if (fileType === "image") {
		return {
			fileType,
			name,
			size: 0,
			key,
			imageUrl: `/api/admin/download-file?path=${encodeURIComponent(key)}`,
		};
	}

	return { fileType, name, size: 0, key };
}

export async function getFileContent(key: string): Promise<string> {
	const buffer = await downloadFile(key);
	return buffer.toString("utf-8");
}

export async function updateFileContent(key: string, content: string): Promise<void> {
	await ensureBucket();
	await uploadFile(key, content, "text/plain");
}

export async function createFolder(prefix: string): Promise<void> {
	await ensureBucket();
	await uploadFile(`${prefix}.keep`, "", "text/plain");
}

export async function uploadFilesToPrefix(
	prefix: string,
	files: { name: string; content: Buffer; contentType: string }[]
): Promise<string[]> {
	await ensureBucket();
	const keys: string[] = [];
	for (const file of files) {
		const key = `${prefix}${file.name}`;
		await uploadFile(key, file.content, file.contentType);
		keys.push(key);
	}
	return keys;
}

export async function deleteEntry(key: string): Promise<void> {
	await deleteFile(key);
}

export async function deleteFolderRecursive(prefix: string): Promise<number> {
	return deleteAllWithPrefix(prefix);
}
