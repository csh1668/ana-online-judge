import { type NextRequest, NextResponse } from "next/server";
import { downloadFile } from "@/lib/storage";
import { INLINE_SAFE_IMAGE_TYPES, STATIC_OBJECT_SECURITY_HEADERS } from "@/lib/upload-safety";

// Content types for files that are safe to serve inline. Anything else is
// forced to download as application/octet-stream — user uploads must never be
// rendered as HTML/SVG/JS on the site origin (stored XSS).
const INLINE_CONTENT_TYPES: Record<string, string> = {
	...INLINE_SAFE_IMAGE_TYPES,
	".pdf": "application/pdf",
};

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> }
) {
	try {
		const { path } = await params;
		const key = path.join("/");

		// Prevent path traversal and restrict to files/ prefix only
		if (key.includes("..") || !key.startsWith("files/")) {
			return new NextResponse("Forbidden", { status: 403 });
		}

		// Get file extension for content type
		const ext = key.substring(key.lastIndexOf(".")).toLowerCase();
		const inlineType = INLINE_CONTENT_TYPES[ext];
		const contentType = inlineType ?? "application/octet-stream";

		// Download file from MinIO
		const buffer = await downloadFile(key);

		// Check if download parameter is present for filename
		const searchParams = request.nextUrl.searchParams;
		const downloadFilename = searchParams.get("download");

		const headers: HeadersInit = {
			"Content-Type": contentType,
			"Cache-Control": "public, max-age=31536000, immutable",
			...STATIC_OBJECT_SECURITY_HEADERS,
		};

		// Force download for anything not inline-safe, or when a filename is requested.
		if (downloadFilename || !inlineType) {
			const fallbackName = key.substring(key.lastIndexOf("/") + 1);
			headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(
				downloadFilename || fallbackName
			)}"`;
		}

		return new NextResponse(new Uint8Array(buffer), { headers });
	} catch (error) {
		console.error("Failed to fetch file:", error);
		return new NextResponse("File not found", { status: 404 });
	}
}
