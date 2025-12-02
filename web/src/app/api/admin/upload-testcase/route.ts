import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { testcases } from "@/db/schema";
import { generateTestcasePath, uploadFile } from "@/lib/storage";

export async function POST(request: Request) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user || session.user.role !== "admin") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const formData = await request.formData();
		const inputFile = formData.get("inputFile") as File | null;
		const outputFile = formData.get("outputFile") as File | null;
		const problemId = parseInt(formData.get("problemId") as string, 10);
		const score = parseInt(formData.get("score") as string, 10) || 0;
		const isHidden = formData.get("isHidden") === "true";

		if (!inputFile || !outputFile) {
			return NextResponse.json({ error: "입력 파일과 출력 파일이 필요합니다." }, { status: 400 });
		}

		if (Number.isNaN(problemId)) {
			return NextResponse.json({ error: "유효하지 않은 문제 ID입니다." }, { status: 400 });
		}

		// Get next testcase index
		const [countResult] = await db
			.select({ count: count() })
			.from(testcases)
			.where(eq(testcases.problemId, problemId));

		const nextIndex = countResult.count + 1;

		// Upload files to MinIO
		const inputPath = generateTestcasePath(problemId, nextIndex, "input");
		const outputPath = generateTestcasePath(problemId, nextIndex, "output");

		const inputBuffer = Buffer.from(await inputFile.arrayBuffer());
		const outputBuffer = Buffer.from(await outputFile.arrayBuffer());

		await Promise.all([
			uploadFile(inputPath, inputBuffer, "text/plain"),
			uploadFile(outputPath, outputBuffer, "text/plain"),
		]);

		// Create testcase record in database
		const [newTestcase] = await db
			.insert(testcases)
			.values({
				problemId,
				inputPath,
				outputPath,
				score,
				isHidden,
			})
			.returning();

		return NextResponse.json({
			message: "테스트케이스가 추가되었습니다.",
			testcase: newTestcase,
		});
	} catch (error) {
		console.error("Upload testcase error:", error);
		return NextResponse.json(
			{ error: "테스트케이스 업로드 중 오류가 발생했습니다." },
			{ status: 500 }
		);
	}
}
