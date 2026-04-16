import { CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { BUCKET, s3Client } from "@/lib/storage/client";
import { uploadFile } from "@/lib/storage/operations";
import { workshopDraftManualInboxPath, workshopDraftManualInboxPrefix } from "@/lib/workshop/paths";

const MAX_INBOX_BYTES = 50 * 1024 * 1024; // mirrors MAX_TESTCASE_BYTES
const NAME_PATTERN = /^[\w\-. ]{1,128}$/;

export type InboxFile = {
	name: string;
	size: number;
	lastModified: string; // ISO
};

function assertValidName(name: string): void {
	if (!NAME_PATTERN.test(name) || name === "." || name === "..") {
		throw new Error("파일명은 영문/숫자/언더바/하이픈/점/공백만 허용되며 1–128자여야 합니다");
	}
}

export async function listInbox(problemId: number, userId: number): Promise<InboxFile[]> {
	const Prefix = workshopDraftManualInboxPrefix(problemId, userId);
	const result = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix }));
	const rows: InboxFile[] = [];
	for (const obj of result.Contents ?? []) {
		if (!obj.Key) continue;
		const name = obj.Key.slice(Prefix.length);
		if (!name || name.includes("/")) continue; // flat only
		rows.push({
			name,
			size: obj.Size ?? 0,
			lastModified: (obj.LastModified ?? new Date()).toISOString(),
		});
	}
	rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return rows;
}

export async function uploadInboxFile(params: {
	problemId: number;
	userId: number;
	filename: string;
	content: Buffer;
}): Promise<InboxFile> {
	assertValidName(params.filename);
	if (params.content.byteLength > MAX_INBOX_BYTES) {
		throw new Error("인박스 파일은 최대 50MB까지 업로드 가능합니다");
	}
	const key = workshopDraftManualInboxPath(params.problemId, params.userId, params.filename);
	await uploadFile(key, params.content, "text/plain");
	return {
		name: params.filename,
		size: params.content.byteLength,
		lastModified: new Date().toISOString(),
	};
}

export async function renameInboxFile(params: {
	problemId: number;
	userId: number;
	oldName: string;
	newName: string;
}): Promise<void> {
	assertValidName(params.oldName);
	assertValidName(params.newName);
	if (params.oldName === params.newName) return;
	const src = workshopDraftManualInboxPath(params.problemId, params.userId, params.oldName);
	const dst = workshopDraftManualInboxPath(params.problemId, params.userId, params.newName);
	await s3Client.send(
		new CopyObjectCommand({
			Bucket: BUCKET,
			CopySource: `/${BUCKET}/${encodeURIComponent(src).replace(/%2F/g, "/")}`,
			Key: dst,
		})
	);
	await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: src }));
}

export async function deleteInboxFile(params: {
	problemId: number;
	userId: number;
	filename: string;
}): Promise<void> {
	assertValidName(params.filename);
	const key = workshopDraftManualInboxPath(params.problemId, params.userId, params.filename);
	await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
