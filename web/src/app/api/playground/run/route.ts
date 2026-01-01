import { type NextRequest, NextResponse } from "next/server";
import { getPlaygroundSession, requirePlaygroundAccess } from "@/actions/playground";
import { auth } from "@/auth";
import { getRedisClient } from "@/lib/redis";

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const userId = parseInt(session.user.id, 10);

	// 권한 체크
	try {
		await requirePlaygroundAccess(userId);
	} catch {
		return NextResponse.json({ error: "No playground access" }, { status: 403 });
	}

	const {
		sessionId,
		targetPath, // 실행할 파일 경로 (Makefile 또는 소스 파일)
		input, // stdin (단일 파일) 또는 file_input (Makefile) 또는 anigmaFileName
		anigmaMode, // ANIGMA 실행 모드 (make build -> make run file=...)
	} = await request.json();

	// 세션 파일 조회
	const playgroundSession = await getPlaygroundSession(sessionId, userId);
	if (!playgroundSession) {
		return NextResponse.json({ error: "Session not found" }, { status: 404 });
	}

	const redis = await getRedisClient();

	// 실행 타입 판별 (Makefile인지 소스 파일인지)
	const filename = targetPath.split("/").pop() || "";
	const isMakefile = filename === "Makefile" || filename === "makefile";

	// 결과 키 생성
	const resultKey = `playground:result:${sessionId}:${Date.now()}`;

	// Encode input to base64 if provided (일반 모드만)
	let file_input_base64: string | null = null;
	let file_input_is_binary = false;

	if (isMakefile && !anigmaMode && input) {
		// Makefile 일반 모드: input을 base64로 인코딩 (항상 텍스트)
		file_input_base64 = Buffer.from(input, 'utf-8').toString('base64');
		file_input_is_binary = false;
	}

	// ANIGMA 모드: playground session에서 파일 찾기 및 검증
	if (isMakefile && anigmaMode) {
		const anigmaFileName = input || "sample.in";
		const anigmaFile = playgroundSession.files.find((f: { path: string }) => f.path === anigmaFileName);

		if (!anigmaFile) {
			return NextResponse.json(
				{ error: `파일을 찾을 수 없습니다: ${anigmaFileName}` },
				{ status: 404 }
			);
		}
	}

	// 모든 파일을 base64로 인코딩 (텍스트/바이너리 구분 없음)
	const { db } = await import("@/db");
	const { playgroundFiles } = await import("@/db/schema");
	const { eq } = await import("drizzle-orm");

	const dbFiles = await db
		.select()
		.from(playgroundFiles)
		.where(eq(playgroundFiles.sessionId, sessionId));

	const { downloadFile } = await import("@/lib/storage");

	const filesWithContent = await Promise.all(
		dbFiles.map(async (dbFile) => {
			try {
				const buffer = await downloadFile(dbFile.minioPath);
				// 모든 파일을 base64로 인코딩
				return {
					path: dbFile.path,
					content: buffer.toString("base64"),
					is_binary: false, // 플래그는 유지하지만 항상 false (호환성)
				};
			} catch (error) {
				console.error(`Failed to read file ${dbFile.path}:`, error);
				return {
					path: dbFile.path,
					content: "",
					is_binary: false,
				};
			}
		})
	);

	// Job 생성
	const job = {
		job_type: "playground",
		session_id: sessionId,
		target_path: targetPath,
		files: filesWithContent,
		stdin_input: isMakefile ? null : input, // 단일 파일 실행 시 (텍스트만)
		file_input_base64: file_input_base64, // Makefile 일반 모드만 (base64 인코딩)
		file_input_is_binary: file_input_is_binary,
		anigma_mode: isMakefile && anigmaMode, // ANIGMA 실행 모드
		anigma_file_name: isMakefile && anigmaMode ? (input || "sample.in") : null, // ANIGMA 파일 이름
		time_limit: 5000, // 5초
		memory_limit: 512, // 512MB
		result_key: resultKey,
	};

	// Job 큐에 추가
	await redis.rpush("judge:queue", JSON.stringify(job));

	// 결과 대기 (최대 30초)
	// BLPOP returns [key, value]
	const result = await redis.blpop(resultKey, 30);

	if (!result) {
		return NextResponse.json({ error: "Execution timeout" }, { status: 408 });
	}

	const executionResult = JSON.parse(result[1]);

	// Save created files to playground session
	if (executionResult.created_files && executionResult.created_files.length > 0) {
		const { savePlaygroundFileBinary } = await import("@/actions/playground");

		// Save each created file (ignore errors to not fail the whole request)
		for (const file of executionResult.created_files) {
			try {
				// Decode base64 content - no binary check, always save as binary
				const contentBuffer = Buffer.from(file.content_base64, "base64");
				await savePlaygroundFileBinary(sessionId, file.path, contentBuffer);
			} catch (error) {
				console.error(`Failed to save created file ${file.path}:`, error);
				// Continue with other files
			}
		}
	}

	return NextResponse.json(executionResult);
}
