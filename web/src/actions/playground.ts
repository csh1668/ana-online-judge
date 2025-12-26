"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { playgroundFiles, playgroundSessions, users } from "@/db/schema";
import {
	deleteAllPlaygroundFiles,
	deleteFile,
	downloadFile,
	generatePlaygroundFilePath,
	uploadFile,
} from "@/lib/storage";

/**
 * 사용자가 플레이그라운드 접근 권한이 있는지 확인
 * - admin 역할이거나
 * - playground_access가 true인 경우
 */
async function hasPlaygroundAccess(userId: number): Promise<boolean> {
	const [user] = await db
		.select({
			role: users.role,
			playgroundAccess: users.playgroundAccess,
		})
		.from(users)
		.where(eq(users.id, userId));

	if (!user) return false;

	return user.role === "admin" || user.playgroundAccess === true;
}

/**
 * 권한 체크 후 에러 반환
 */
export async function requirePlaygroundAccess(userId: number) {
	const hasAccess = await hasPlaygroundAccess(userId);
	if (!hasAccess) {
		throw new Error("플레이그라운드 사용 권한이 없습니다.");
	}
}

// 세션 생성 (빈 세션, 자동 파일 생성 없음)
export async function createPlaygroundSession(userId: number, name?: string) {
	// 권한 체크
	await requirePlaygroundAccess(userId);

	const [session] = await db
		.insert(playgroundSessions)
		.values({
			userId,
			name: name ?? "Untitled",
		})
		.returning();

	// 자동 파일 생성 없음 - 사용자가 직접 파일 생성/업로드

	return session;
}

// 세션 목록 조회
export async function getPlaygroundSessions(userId: number) {
	await requirePlaygroundAccess(userId);

	return db
		.select()
		.from(playgroundSessions)
		.where(eq(playgroundSessions.userId, userId))
		.orderBy(playgroundSessions.updatedAt);
}

// 세션 상세 조회 (파일 포함)
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

	// MinIO에서 파일 내용 가져오기
	const files = await Promise.all(
		dbFiles.map(async (file) => {
			try {
				const buffer = await downloadFile(file.minioPath);
				const content = buffer.toString("utf-8");
				return { path: file.path, content };
			} catch (_error) {
				// 파일이 없거나 읽을 수 없는 경우 빈 내용 반환
				return { path: file.path, content: "" };
			}
		})
	);

	return { ...session, files };
}

// 세션 삭제
export async function deletePlaygroundSession(sessionId: string, userId: number) {
	await requirePlaygroundAccess(userId);

	// MinIO에서 모든 파일 삭제
	await deleteAllPlaygroundFiles(sessionId);

	// DB에서 세션 삭제 (cascade로 파일도 삭제됨)
	await db
		.delete(playgroundSessions)
		.where(and(eq(playgroundSessions.id, sessionId), eq(playgroundSessions.userId, userId)));

	return { success: true };
}

async function verifySessionOwnership(sessionId: string): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Unauthorized");
	}

	const userId = parseInt(session.user.id, 10);

	// Check if user has access to playground feature
	await requirePlaygroundAccess(userId);

	// Check if user owns the session
	const [pgSession] = await db
		.select({ userId: playgroundSessions.userId })
		.from(playgroundSessions)
		.where(eq(playgroundSessions.id, sessionId));

	if (!pgSession || pgSession.userId !== userId) {
		throw new Error("Session not found or access denied");
	}
}

// 파일 저장
export async function savePlaygroundFile(sessionId: string, path: string, content: string) {
	await verifySessionOwnership(sessionId);

	// MinIO에 파일 업로드
	const minioPath = generatePlaygroundFilePath(sessionId, path);
	await uploadFile(minioPath, content, "text/plain");

	// DB에 메타데이터 저장
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

// 파일 삭제
export async function deletePlaygroundFile(sessionId: string, path: string) {
	await verifySessionOwnership(sessionId);

	// DB에서 minioPath 조회
	const [file] = await db
		.select()
		.from(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, path)));

	if (file) {
		// MinIO에서 파일 삭제
		try {
			await deleteFile(file.minioPath);
		} catch (_error) {
			// MinIO에 파일이 없어도 계속 진행
		}
	}

	// DB에서 파일 삭제
	await db
		.delete(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, path)));
}

// 파일 이름 변경
export async function renamePlaygroundFile(sessionId: string, oldPath: string, newPath: string) {
	await verifySessionOwnership(sessionId);

	// DB에서 파일 정보 조회
	const [file] = await db
		.select()
		.from(playgroundFiles)
		.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, oldPath)));

	if (file) {
		// MinIO에서 파일 내용 가져오기
		const content = await downloadFile(file.minioPath);

		// 새로운 경로로 업로드
		const newMinioPath = generatePlaygroundFilePath(sessionId, newPath);
		await uploadFile(newMinioPath, content, "application/octet-stream");

		// 이전 파일 삭제
		try {
			await deleteFile(file.minioPath);
		} catch (_error) {
			// 삭제 실패해도 계속 진행
		}

		// DB 업데이트
		await db
			.update(playgroundFiles)
			.set({ path: newPath, minioPath: newMinioPath, updatedAt: new Date() })
			.where(and(eq(playgroundFiles.sessionId, sessionId), eq(playgroundFiles.path, oldPath)));
	}
}
