import { type NextRequest, NextResponse } from "next/server";
import { downloadFile } from "@/lib/storage";
import { INLINE_SAFE_IMAGE_TYPES, STATIC_OBJECT_SECURITY_HEADERS } from "@/lib/upload-safety";

// Only raster images are served inline. SVG (which can carry scripts) and any
// unknown extension are forced to download.
const CONTENT_TYPES = INLINE_SAFE_IMAGE_TYPES;

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> }
) {
	try {
		const { path } = await params;
		const key = path.join("/");

		// Prevent path traversal and restrict to images/ prefix only
		if (key.includes("..") || !key.startsWith("images/")) {
			return new NextResponse("Forbidden", { status: 403 });
		}

		// Get file extension for content type
		const ext = key.substring(key.lastIndexOf(".")).toLowerCase();
		const inlineType = CONTENT_TYPES[ext];

		// Download file from MinIO
		const buffer = await downloadFile(key);

		const headers: HeadersInit = {
			"Content-Type": inlineType ?? "application/octet-stream",
			"Cache-Control": "public, max-age=31536000, immutable",
			...STATIC_OBJECT_SECURITY_HEADERS,
		};
		if (!inlineType) {
			headers["Content-Disposition"] = "attachment";
		}

		return new NextResponse(new Uint8Array(buffer), { headers });
	} catch (error) {
		console.error("Failed to fetch image:", error);
		return new NextResponse("Image not found", { status: 404 });
	}
}
