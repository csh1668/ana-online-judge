import type { LanguageCode, Translations } from "@/db/schema";
import { generateImagePath, getImageUrl, uploadImage } from "@/lib/storage";
import { upsertTranslation } from "./problems";

export const ALLOWED_STATEMENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_STATEMENT_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB — mirrors uploadProblemImage

export interface StatementImageInput {
	/** Original filename (basename only is used as the storage key). */
	name: string;
	type: string;
	buffer: Buffer;
}

export interface StatementImageUploadResult {
	translations: Translations;
	/** Stored images: original basename → S3 key + public URL. */
	images: { name: string; key: string; url: string }[];
	/** Attached images that the markdown never referenced (stored anyway). */
	unreferenced: string[];
}

function basenameOf(name: string): string {
	return name.replace(/\\/g, "/").split("/").pop() ?? name;
}

/**
 * Validate an attached image. Throws with a user-facing message on failure.
 */
export function validateStatementImage(image: StatementImageInput): void {
	const name = basenameOf(image.name);
	if (!name || name === "." || name === "..") {
		throw new Error(`Invalid image filename: "${image.name}"`);
	}
	if (!ALLOWED_STATEMENT_IMAGE_TYPES.includes(image.type)) {
		throw new Error(
			`Unsupported image type for "${name}": ${image.type || "unknown"} (JPEG, PNG, GIF, WebP only)`
		);
	}
	if (image.buffer.length > MAX_STATEMENT_IMAGE_SIZE) {
		throw new Error(`Image "${name}" exceeds 5MB`);
	}
}

function isRemoteOrAbsolute(src: string): boolean {
	return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src);
}

/**
 * Rewrite markdown image references that point at a local file whose basename
 * matches one of `urlByName` keys. Handles `![alt](path "title")` and
 * `<img src="path">`. Remote (`http://…`) and site-absolute (`/api/…`) sources
 * are left untouched. Returns the rewritten markdown and the set of basenames
 * that were actually referenced.
 */
export function rewriteLocalImageRefs(
	markdown: string,
	urlByName: Map<string, string>
): { content: string; referenced: Set<string> } {
	const referenced = new Set<string>();

	const resolve = (rawSrc: string): string | null => {
		const src = rawSrc.trim().replace(/^<|>$/g, "");
		if (!src || isRemoteOrAbsolute(src)) return null;
		let decoded = src;
		try {
			decoded = decodeURIComponent(src);
		} catch {
			// keep raw
		}
		const name = basenameOf(decoded);
		const url = urlByName.get(name);
		if (!url) return null;
		referenced.add(name);
		return url;
	};

	// ![alt](src "title") — src has no whitespace or ')' unless wrapped in <>
	let content = markdown.replace(
		/(!\[[^\]]*\]\()(<[^>]*>|[^\s)]+)((?:\s+"[^"]*")?\))/g,
		(match, open: string, src: string, close: string) => {
			const url = resolve(src);
			return url ? `${open}${url}${close}` : match;
		}
	);

	// <img ... src="path" ...>
	content = content.replace(
		/(<img\b[^>]*?\bsrc=)(["'])([^"']*)\2/gi,
		(match, open: string, quote: string, src: string) => {
			const url = resolve(src);
			return url ? `${open}${quote}${url}${quote}` : match;
		}
	);

	return { content, referenced };
}

/**
 * Store statement images under `images/problems/{problemId}/{basename}`
 * (overwriting on re-upload so the operation is idempotent), rewrite the
 * markdown so local references point at the stored URLs, then upsert the
 * translation.
 */
export async function upsertTranslationWithImages(
	problemId: number,
	language: LanguageCode,
	patch: { title: string; content: string; translatorId?: number | null },
	images: StatementImageInput[]
): Promise<StatementImageUploadResult> {
	for (const image of images) validateStatementImage(image);

	const seen = new Set<string>();
	for (const image of images) {
		const name = basenameOf(image.name);
		if (seen.has(name)) throw new Error(`Duplicate image filename: "${name}"`);
		seen.add(name);
	}

	const stored: StatementImageUploadResult["images"] = [];
	const urlByName = new Map<string, string>();
	for (const image of images) {
		const name = basenameOf(image.name);
		const key = generateImagePath(problemId, name);
		await uploadImage(key, image.buffer, image.type);
		const url = getImageUrl(key);
		urlByName.set(name, url);
		stored.push({ name, key, url });
	}

	const { content, referenced } = rewriteLocalImageRefs(patch.content, urlByName);
	const translations = await upsertTranslation(problemId, language, { ...patch, content });

	return {
		translations,
		images: stored,
		unreferenced: stored.map((s) => s.name).filter((n) => !referenced.has(n)),
	};
}
