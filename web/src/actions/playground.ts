"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { playgroundFiles, playgroundSessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/auth-utils";
import {
	deleteAllPlaygroundFiles,
	deleteFile,
	downloadFile,
	generatePlaygroundFilePath,
	uploadFile,
} from "@/lib/storage";

async function hasPlaygroundAccess(userId: number): Promise<boolean> {
	const [user] = await db
		.select({
			id: users.id,
		})
		.from(users)
		.where(eq(users.id, userId));

	if (!user) return false;

	return user.id !== undefined;
}

export async function requirePlaygroundAccess(userId: number) {
	const hasAccess = await hasPlaygroundAccess(userId);
	if (!hasAccess) {
		throw new Error("플레이그라운드 사용 권한이 없습니다.");
	}
}

export async function createPlaygroundSession(userId: number, name?: string) {
	await requirePlaygroundAccess(userId);

	const [session] = await db
		.insert(playgroundSessions)
		.values({
			userId,
			name: name ?? "Untitled",
		})
		.returning();

	return session;
}

export async function getPlaygroundSessions(userId: number) {
	await requirePlaygroundAccess(userId);

	return db
		.select()
		.from(playgroundSessions)
		.where(eq(playgroundSessions.userId, userId))
		.orderBy(playgroundSessions.updatedAt);
}

export async function getPlaygroundSession(sessionId: string, userId: number) {
	await requirePlaygroundAccess(userId);

	const [session] = await db
		.select()
		.from(playgroundSessions)
		.where(and(eq(playgroundSessions.id, sessionId), eq(playgroundSessions.userId, userId)));

	if (!session) return null;

	const dbFiles = await db
		.select()
		.from(playgroundFiles)
		.where(eq(playgroundFiles.sessionId, sessionId));

	const files = await Promise.all(
		dbFiles.map(async (file) => {
			try {
				const buffer = await downloadFile(file.minioPath);
				const content = buffer.toString("base64");
				return { path: file.path, content };
			} catch (_error) {
				return { path: file.path, content: "" };
			}
		})
	);

	return { ...session, files };
}

export async function deletePlaygroundSession(sessionId: string, userId: number) {
	await requirePlaygroundAccess(userId);

	await deleteAllPlaygroundFiles(sessionId);

	await db
		.delete(playgroundSessions)
		.where(and(eq(playgroundSessions.id, sessionId), eq(playgroundSessions.userId, userId)));

	return { success: true };
}

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

export async function savePlaygroundFile(sessionId: string, path: string, content: string) {
	await verifySessionOwnership(sessionId);

	const buffer = Buffer.from(content, "base64");
	const minioPath = generatePlaygroundFilePath(sessionId, path);
	await uploadFile(minioPath, buffer, "application/octet-stream");

	await db
		.insert(playgroundFiles)
		.values({ sessionId, path, minioPath })
		.onConflictDoUpdate({
			target: [playgroundFiles.sessionId, playgroundFiles.path],
			set: { minioPath, updatedAt: new Date() },
		});

	// 세션 업데이트 시간 갱신
	await db
		.update(playgroundSessions)
		.set({ updatedAt: new Date() })
		.where(eq(playgroundSessions.id, sessionId));
}

export async function savePlaygroundFileBinary(sessionId: string, path: string, content: Buffer) {
	await verifySessionOwnership(sessionId);

	const minioPath = generatePlaygroundFilePath(sessionId, path);

	// Find existing file
	const [existingFile] = await db
		.select()
		.from(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, path)));

	// Delete existing file from MinIO if it exists
	if (existingFile) {
		try {
			await deleteFile(existingFile.minioPath);
		} catch (error) {
			// Ignore deletion errors
			console.error(`Failed to delete old file ${existingFile.minioPath}:`, error);
		}
	}

	// Also delete the new path to ensure clean state
	try {
		await deleteFile(minioPath);
	} catch (_error) {
		// Ignore if file doesn't exist
	}

	// Delete DB record if exists to ensure clean overwrite
	if (existingFile) {
		await db
			.delete(playgroundFiles)
			.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, path)));
	}

	// Upload new file
	await uploadFile(minioPath, content, "application/octet-stream");

	// Insert new DB record
	await db.insert(playgroundFiles).values({ sessionId, path, minioPath });

	// 세션 업데이트 시간 갱신
	await db
		.update(playgroundSessions)
		.set({ updatedAt: new Date() })
		.where(eq(playgroundSessions.id, sessionId));
}

export async function deletePlaygroundFile(sessionId: string, path: string) {
	await verifySessionOwnership(sessionId);

	const [file] = await db
		.select()
		.from(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, path)));

	if (file) {
		try {
			await deleteFile(file.minioPath);
		} catch (_error) {
			// Ignore
		}
	}

	await db
		.delete(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, path)));
}

export async function renamePlaygroundFile(sessionId: string, oldPath: string, newPath: string) {
	await verifySessionOwnership(sessionId);

	const [file] = await db
		.select()
		.from(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, oldPath)));

	if (file) {
		const content = await downloadFile(file.minioPath);
		const newMinioPath = generatePlaygroundFilePath(sessionId, newPath);
		await uploadFile(newMinioPath, content, "application/octet-stream");

		try {
			await deleteFile(file.minioPath);
		} catch (_error) {
			// Ignore
		}

		await db
			.update(playgroundFiles)
			.set({ path: newPath, minioPath: newMinioPath, updatedAt: new Date() })
			.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, oldPath)));
	}
}
