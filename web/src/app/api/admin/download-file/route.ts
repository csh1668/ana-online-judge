import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { downloadFile } from "@/lib/storage";

export async function GET(request: Request) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user || session.user.role !== "admin") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const path = searchParams.get("path");

		if (!path) {
			return NextResponse.json({ error: "Path is required" }, { status: 400 });
		}

		// Download file from MinIO
		const fileBuffer = await downloadFile(path);

		// Return file content
		return new NextResponse(fileBuffer as unknown as BodyInit, {
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Disposition": `attachment; filename="${path.split("/").pop()}"`,
			},
		});
	} catch (error) {
		console.error("Download file error:", error);
		return NextResponse.json({ error: "파일 다운로드 중 오류가 발생했습니다." }, { status: 500 });
	}
}
