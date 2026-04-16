"use server";

import * as problemsSvc from "@/lib/services/workshop-problems";
import { generateWorkshopProblemImagePath, getImageUrl, uploadImage } from "@/lib/storage";
import { requireWorkshopAccess } from "@/lib/workshop/auth";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB — mirrors uploadProblemImage

/**
 * Upload an inline statement image for a workshop problem. Stores under
 * `images/workshopProblems/{workshopProblemId}/{uniqueFilename}` so that the
 * Phase 8 publish pipeline can migrate these keys + rewrite markdown URLs
 * to the admin namespace.
 *
 * Mirrors the return shape of `uploadProblemImage` so MarkdownEditor's hook
 * can treat both cases uniformly.
 */
export async function uploadWorkshopProblemImage(
	workshopProblemId: number,
	formData: FormData
): Promise<{ success: true; url: string } | { success: false; error: string }> {
	try {
		const { userId, isAdmin } = await requireWorkshopAccess();
		const problem = await problemsSvc.getWorkshopProblemForUser(workshopProblemId, userId, isAdmin);
		if (!problem) {
			return { success: false, error: "문제를 찾을 수 없거나 접근 권한이 없습니다" };
		}

		const file = formData.get("file");
		if (!(file instanceof File)) {
			return { success: false, error: "파일이 없습니다." };
		}
		if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
			return {
				success: false,
				error: "지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 지원)",
			};
		}
		if (file.size > MAX_IMAGE_SIZE) {
			return { success: false, error: "파일 크기가 5MB를 초과합니다." };
		}

		const dotIndex = file.name.lastIndexOf(".");
		const ext = dotIndex !== -1 ? file.name.substring(dotIndex) : "";
		const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
		const key = generateWorkshopProblemImagePath(workshopProblemId, uniqueName);

		const buffer = Buffer.from(await file.arrayBuffer());
		const result = await uploadImage(key, buffer, file.type);
		return { success: true, url: result.url ?? getImageUrl(key) };
	} catch (err) {
		console.error("[workshop-images] upload failed:", err);
		return { success: false, error: "이미지 업로드에 실패했습니다." };
	}
}
