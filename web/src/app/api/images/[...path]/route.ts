import { type NextRequest, NextResponse } from "next/server";
import { downloadFile } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
};

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> }
) {
	try {
		const { path } = await params;
		const key = path.join("/");

		// Get file extension for content type
		const ext = key.substring(key.lastIndexOf(".")).toLowerCase();
		const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

		// Download file from MinIO
		const buffer = await downloadFile(key);

		return new NextResponse(new Uint8Array(buffer), {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=31536000, immutable",
			},
		});
	} catch (error) {
		console.error("Failed to fetch image:", error);
		return new NextResponse("Image not found", { status: 404 });
	}
}
