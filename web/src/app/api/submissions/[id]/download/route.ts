import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { downloadFile } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id } = await params;
		const submissionId = parseInt(id, 10);

		if (Number.isNaN(submissionId)) {
			return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
		}

		const isAdmin = session.user.role === "admin";
		const currentUserId = session.user.id ? parseInt(session.user.id, 10) : null;

		// Get submission
		const [submission] = await db
			.select({
				id: submissions.id,
				userId: submissions.userId,
				code: submissions.code,
				language: submissions.language,
				zipPath: submissions.zipPath,
				anigmaInputPath: submissions.anigmaInputPath,
				anigmaTaskType: submissions.anigmaTaskType,
			})
			.from(submissions)
			.where(eq(submissions.id, submissionId))
			.limit(1);

		if (!submission) {
			return NextResponse.json({ error: "Submission not found" }, { status: 404 });
		}

		// Check access: admin or own submission
		if (!isAdmin && (currentUserId === null || submission.userId !== currentUserId)) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		// Determine file extension based on language
		const languageExtensions: Record<string, string> = {
			c: "c",
			cpp: "cpp",
			python: "py",
			java: "java",
			javascript: "js",
		};
		const extension = languageExtensions[submission.language] || "txt";

		// Handle Anigma submissions
		if (submission.anigmaTaskType === 1 && submission.anigmaInputPath) {
			// Task 1: Download input file from MinIO
			try {
				const fileBuffer = await downloadFile(submission.anigmaInputPath);
				const filename = `submission_${submission.id}_input.txt`;
				return new NextResponse(fileBuffer as unknown as BodyInit, {
					headers: {
						"Content-Type": "text/plain",
						"Content-Disposition": `attachment; filename="${filename}"`,
					},
				});
			} catch (error) {
				console.error("Failed to download Anigma input file:", error);
				return NextResponse.json({ error: "파일을 다운로드할 수 없습니다." }, { status: 500 });
			}
		} else if (submission.anigmaTaskType === 2 && submission.zipPath) {
			// Task 2: Download ZIP file from MinIO
			try {
				const fileBuffer = await downloadFile(submission.zipPath);
				const filename = `submission_${submission.id}.zip`;
				return new NextResponse(fileBuffer as unknown as BodyInit, {
					headers: {
						"Content-Type": "application/zip",
						"Content-Disposition": `attachment; filename="${filename}"`,
					},
				});
			} catch (error) {
				console.error("Failed to download Anigma ZIP file:", error);
				return NextResponse.json({ error: "파일을 다운로드할 수 없습니다." }, { status: 500 });
			}
		} else {
			// Regular submission: Return code as file
			const filename = `submission_${submission.id}.${extension}`;
			return new NextResponse(submission.code, {
				headers: {
					"Content-Type": "text/plain",
					"Content-Disposition": `attachment; filename="${filename}"`,
				},
			});
		}
	} catch (error) {
		console.error("Download submission error:", error);
		return NextResponse.json({ error: "파일 다운로드 중 오류가 발생했습니다." }, { status: 500 });
	}
}
