/**
 * Content-based validation helpers for user uploads.
 *
 * Uploaded objects are served from the site origin (`/api/files`, `/api/images`),
 * so anything a browser could render as active content (HTML, SVG, JS) must
 * never be accepted or served inline. Never trust `file.type` / `file.name`.
 */

export type DetectedImage = { mime: string; ext: string };

/** Sniff JPEG/PNG/GIF/WebP by magic bytes. Returns null for anything else. */
export function detectImageType(buf: Uint8Array): DetectedImage | null {
	if (buf.length < 12) return null;
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
		return { mime: "image/jpeg", ext: ".jpg" };
	}
	if (
		buf[0] === 0x89 &&
		buf[1] === 0x50 &&
		buf[2] === 0x4e &&
		buf[3] === 0x47 &&
		buf[4] === 0x0d &&
		buf[5] === 0x0a &&
		buf[6] === 0x1a &&
		buf[7] === 0x0a
	) {
		return { mime: "image/png", ext: ".png" };
	}
	if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
		return { mime: "image/gif", ext: ".gif" };
	}
	if (
		buf[0] === 0x52 &&
		buf[1] === 0x49 &&
		buf[2] === 0x46 &&
		buf[3] === 0x46 &&
		buf[8] === 0x57 &&
		buf[9] === 0x45 &&
		buf[10] === 0x42 &&
		buf[11] === 0x50
	) {
		return { mime: "image/webp", ext: ".webp" };
	}
	return null;
}

/** Lower-cased extension including the dot, or "" if none. Strips anything unsafe. */
export function sanitizeExtension(filename: string): string {
	const dot = filename.lastIndexOf(".");
	if (dot === -1) return "";
	const ext = filename.slice(dot).toLowerCase();
	return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
	".pdf",
	".zip",
	".txt",
	".csv",
	".json",
	".md",
	".in",
	".out",
	".ans",
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
]);

export function isAllowedUploadExtension(ext: string): boolean {
	return ALLOWED_UPLOAD_EXTENSIONS.has(ext);
}

/** Raster image types that are safe to serve inline from the site origin. */
export const INLINE_SAFE_IMAGE_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
};

/** Headers that neutralise any served object even if it is somehow active content. */
export const STATIC_OBJECT_SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "default-src 'none'; sandbox",
};
