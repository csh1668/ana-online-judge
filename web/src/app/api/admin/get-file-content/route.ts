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
		const content = fileBuffer.toString("utf-8");

		// Return file content as JSON
		return NextResponse.json({ content });
	} catch (error) {
		console.error("Get file content error:", error);
		return NextResponse.json(
			{ error: "파일 내용을 가져오는 중 오류가 발생했습니다." },
			{ status: 500 }
		);
	}
}
