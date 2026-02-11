"use server";

import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import { db } from "@/db";
import { playgroundFiles, playgroundSessions } from "@/db/schema";
import { requireAuth } from "@/lib/auth-utils";
import { deleteFile, downloadFile, generatePlaygroundFilePath, uploadFile } from "@/lib/storage";
import { requirePlaygroundAccess } from "./playground";

// ZIP 업로드 (현재 사용되지 않음 - extractZipToPlayground 사용)
export async function uploadZipToPlayground(sessionId: string, zipBuffer: ArrayBuffer) {
	await verifySessionOwnership(sessionId);

	const zip = await JSZip.loadAsync(zipBuffer);
	const files: { path: string; content: Buffer }[] = [];

	for (const [path, file] of Object.entries(zip.files)) {
		if (!file.dir) {
			const content = await file.async("nodebuffer");
			files.push({ path, content });
		}
	}

	// 기존 파일 삭제
	const existingFiles = await db
		.select()
		.from(playgroundFiles)
		.where(eq(playgroundFiles.sessionId, sessionId));

	// MinIO에서 기존 파일들 삭제
	for (const file of existingFiles) {
		try {
			await deleteFile(file.minioPath);
		} catch (_error) {
			// 파일이 없어도 계속 진행
		}
	}

	// DB에서 기존 파일 삭제
	await db.delete(playgroundFiles).where(eq(playgroundFiles.sessionId, sessionId));

	// 새 파일들 업로드
	if (files.length > 0) {
		for (const file of files) {
			const minioPath = generatePlaygroundFilePath(sessionId, file.path);
			await uploadFile(minioPath, file.content, "application/octet-stream");

			await db.insert(playgroundFiles).values({
				sessionId,
				path: file.path,
				minioPath,
			});
		}
	}

	return { success: true, fileCount: files.length };
}

// ZIP 다운로드 (전체 또는 특정 폴더)
export async function downloadPlaygroundAsZip(
	sessionId: string,
	folderPath?: string
): Promise<{ data: string; filename: string }> {
	await verifySessionOwnership(sessionId);

	const files = await db
		.select()
		.from(playgroundFiles)
		.where(eq(playgroundFiles.sessionId, sessionId));

	const zip = new JSZip();

	for (const file of files) {
		// folderPath가 지정되면 해당 폴더만 포함
		if (!folderPath || file.path.startsWith(`${folderPath}/`) || file.path === folderPath) {
			const relativePath = folderPath
				? file.path.slice(folderPath.length).replace(/^\//, "")
				: file.path;

			if (relativePath) {
				// MinIO에서 파일 다운로드
				const buffer = await downloadFile(file.minioPath);
				zip.file(relativePath, buffer);
			}
		}
	}

	const base64 = await zip.generateAsync({ type: "base64" });
	const filename = folderPath ? `${folderPath.split("/").pop()}.zip` : "playground.zip";

	return { data: base64, filename };
}

// 세션 소유권 확인
async function verifySessionOwnership(sessionId: string): Promise<void> {
	const { userId } = await requireAuth();

	await requirePlaygroundAccess(userId);

	const [pgSession] = await db
		.select({ userId: playgroundSessions.userId })
		.from(playgroundSessions)
		.where(eq(playgroundSessions.id, sessionId));

	if (!pgSession || pgSession.userId !== userId) {
		throw new Error("Session not found or access denied");
	}
}

// ZIP 파일 압축 풀기 (기존 파일에 추가)
export async function extractZipToPlayground(
	sessionId: string,
	zipPath: string,
	overwriteConflicts: boolean
): Promise<{ success: boolean; addedFiles: string[]; conflicts: string[] }> {
	await verifySessionOwnership(sessionId);

	// ZIP 파일 내용 가져오기
	const [zipFile] = await db
		.select()
		.from(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, zipPath)));

	if (!zipFile) {
		throw new Error("ZIP file not found");
	}

	// MinIO에서 ZIP 파일 다운로드
	const zipBuffer = await downloadFile(zipFile.minioPath);

	// ZIP 파일 파싱
	const zip = await JSZip.loadAsync(zipBuffer);
	const extractedFiles: { path: string; content: Buffer }[] = [];

	for (const [relativePath, file] of Object.entries(zip.files)) {
		if (!file.dir) {
			const content = await file.async("nodebuffer");
			// ZIP 파일이 있는 폴더에 압축 풀기
			const basePath = zipPath.substring(0, zipPath.lastIndexOf("/"));
			const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath;
			extractedFiles.push({ path: fullPath, content });
		}
	}

	// 기존 파일 체크
	const existingFiles = await db
		.select()
		.from(playgroundFiles)
		.where(eq(playgroundFiles.sessionId, sessionId));

	const existingPaths = new Set(existingFiles.map((f) => f.path));
	const conflicts: string[] = [];
	const addedFiles: string[] = [];

	for (const file of extractedFiles) {
		if (existingPaths.has(file.path)) {
			conflicts.push(file.path);
			if (overwriteConflicts) {
				// MinIO에 업로드
				const minioPath = generatePlaygroundFilePath(sessionId, file.path);
				await uploadFile(minioPath, file.content, "application/octet-stream");

				// DB 업데이트
				await db
					.update(playgroundFiles)
					.set({ minioPath, updatedAt: new Date() })
					.where(
						and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, file.path))
					);

				addedFiles.push(file.path);
			}
		} else {
			// 새 파일 생성
			const minioPath = generatePlaygroundFilePath(sessionId, file.path);
			await uploadFile(minioPath, file.content, "application/octet-stream");

			await db.insert(playgroundFiles).values({
				sessionId,
				path: file.path,
				minioPath,
			});

			addedFiles.push(file.path);
		}
	}

	return { success: true, addedFiles, conflicts };
}

// 선택된 파일들 다운로드 (1개면 단일 파일, 2개 이상이면 ZIP)
export async function downloadPlaygroundFiles(
	sessionId: string,
	paths: string[]
): Promise<{ data: string; filename: string; isZip: boolean }> {
	await verifySessionOwnership(sessionId);

	if (paths.length === 0) {
		throw new Error("No files selected");
	}

	const files = await db
		.select()
		.from(playgroundFiles)
		.where(eq(playgroundFiles.sessionId, sessionId));

	// 선택된 파일들만 필터링
	const selectedFiles = files.filter((f) => paths.includes(f.path));

	if (selectedFiles.length === 0) {
		throw new Error("Selected files not found");
	}

	// 1개면 단일 파일로 다운로드
	if (selectedFiles.length === 1) {
		const file = selectedFiles[0];
		const filename = file.path.split("/").pop() || "file.txt";

		// MinIO에서 파일 다운로드
		const buffer = await downloadFile(file.minioPath);
		const data = buffer.toString("base64");

		return { data, filename, isZip: false };
	}

	// 2개 이상이면 ZIP으로
	const zip = new JSZip();
	for (const file of selectedFiles) {
		// MinIO에서 파일 다운로드
		const buffer = await downloadFile(file.minioPath);
		zip.file(file.path, buffer);
	}

	const base64 = await zip.generateAsync({ type: "base64" });
	return { data: base64, filename: "files.zip", isZip: true };
}

// 단일 파일 업로드 (Base64 또는 일반 텍스트)
export async function uploadSingleFile(
	sessionId: string,
	targetPath: string,
	content: string,
	isBase64 = false
): Promise<{ success: boolean }> {
	await verifySessionOwnership(sessionId);

	// Base64인 경우 디코딩
	let fileContent: Buffer | string;
	if (isBase64) {
		// data:image/png;base64,... 형식에서 base64 부분만 추출
		const base64Data = content.includes(",") ? content.split(",")[1] : content;
		fileContent = Buffer.from(base64Data, "base64");
	} else {
		fileContent = content;
	}

	// MinIO에 업로드
	const minioPath = generatePlaygroundFilePath(sessionId, targetPath);
	await uploadFile(minioPath, fileContent, "application/octet-stream");

	// DB에 저장
	await db
		.insert(playgroundFiles)
		.values({ sessionId, path: targetPath, minioPath })
		.onConflictDoUpdate({
			target: [playgroundFiles.sessionId, playgroundFiles.path],
			set: { minioPath, updatedAt: new Date() },
		});

	return { success: true };
}

// 빈 폴더 생성 (.gitkeep 파일로 표시)
export async function createFolder(
	sessionId: string,
	folderPath: string
): Promise<{ success: boolean }> {
	await verifySessionOwnership(sessionId);

	// 폴더를 표시하기 위해 .gitkeep 파일 생성
	const gitkeepPath = `${folderPath}/.gitkeep`;
	const minioPath = generatePlaygroundFilePath(sessionId, gitkeepPath);

	// MinIO에 빈 파일 업로드
	await uploadFile(minioPath, "", "text/plain");

	// DB에 저장
	await db.insert(playgroundFiles).values({
		sessionId,
		path: gitkeepPath,
		minioPath,
	});

	return { success: true };
}
