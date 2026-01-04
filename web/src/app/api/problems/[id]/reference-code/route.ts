import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { contestParticipants, contestProblems, problems } from "@/db/schema";
import { downloadFile } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const problemId = parseInt(id, 10);

		if (Number.isNaN(problemId)) {
			return NextResponse.json({ error: "Invalid problem ID" }, { status: 400 });
		}

		// Get problem
		const [problem] = await db
			.select({
				id: problems.id,
				title: problems.title,
				problemType: problems.problemType,
				referenceCodePath: problems.referenceCodePath,
				isPublic: problems.isPublic,
			})
			.from(problems)
			.where(eq(problems.id, problemId))
			.limit(1);

		if (!problem) {
			return NextResponse.json({ error: "Problem not found" }, { status: 404 });
		}

		// Check if problem is ANIGMA type
		if (problem.problemType !== "anigma") {
			return NextResponse.json({ error: "This problem is not an ANIGMA problem" }, { status: 400 });
		}

		// Check if reference code exists
		if (!problem.referenceCodePath) {
			return NextResponse.json({ error: "Reference code not available" }, { status: 404 });
		}

		// Check access permissions
		const session = await auth();
		const isAdmin = session?.user?.role === "admin";

		// If problem is not public, check access
		if (!problem.isPublic && !isAdmin) {
			if (!session?.user) {
				return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
			}

			// Check if user has access through contest participation
			const userId = parseInt(session.user.id, 10);
			const contestAccess = await db
				.select({
					contestId: contestProblems.contestId,
				})
				.from(contestProblems)
				.innerJoin(
					contestParticipants,
					eq(contestProblems.contestId, contestParticipants.contestId)
				)
				.where(
					and(eq(contestProblems.problemId, problemId), eq(contestParticipants.userId, userId))
				)
				.limit(1);

			if (contestAccess.length === 0) {
				return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
			}
		}

		// Download file from MinIO
		try {
			const fileBuffer = await downloadFile(problem.referenceCodePath);
			// Create filename from problem title, replacing spaces with underscores and removing special characters
			const sanitizedTitle = problem.title
				.replace(/\s+/g, "_")
				.replace(/[<>:"/\\|?*]/g, "");
			const filename = `${sanitizedTitle}.zip`;
			// Use UTF-8 encoding for proper handling of Korean characters
			const encodedFilename = encodeURIComponent(filename);
			return new NextResponse(fileBuffer as unknown as BodyInit, {
				headers: {
					"Content-Type": "application/zip",
					"Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
				},
			});
		} catch (error) {
			console.error("Failed to download reference code:", error);
			return NextResponse.json({ error: "파일을 다운로드할 수 없습니다." }, { status: 500 });
		}
	} catch (error) {
		console.error("Download reference code error:", error);
		return NextResponse.json({ error: "파일 다운로드 중 오류가 발생했습니다." }, { status: 500 });
	}
}
