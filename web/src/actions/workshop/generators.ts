"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-generators";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

const SUPPORTED_LANGUAGES: svc.GeneratorLanguage[] = [
	"c",
	"cpp",
	"python",
	"java",
	"rust",
	"go",
	"javascript",
];

function parseLanguage(raw: FormDataEntryValue | null): svc.GeneratorLanguage {
	if (typeof raw !== "string") throw new Error("언어를 선택해주세요");
	if (!(SUPPORTED_LANGUAGES as string[]).includes(raw)) {
		throw new Error(`지원하지 않는 언어입니다: ${raw}`);
	}
	return raw as svc.GeneratorLanguage;
}

export async function listWorkshopGenerators(problemId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const rows = await svc.listGeneratorsForDraft(draft.id);
	return { draftId: draft.id, generators: rows };
}

export async function readWorkshopGeneratorSource(problemId: number, generatorId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	return svc.readGeneratorSource(draft.id, generatorId);
}

export async function uploadWorkshopGenerator(problemId: number, formData: FormData) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);

	const nameRaw = formData.get("name");
	const file = formData.get("file");
	const language = parseLanguage(formData.get("language"));
	if (typeof nameRaw !== "string" || !nameRaw.trim()) {
		throw new Error("제너레이터 이름을 입력해주세요");
	}
	if (!(file instanceof File) || file.size === 0) {
		throw new Error("소스 파일을 선택해주세요");
	}
	const source = Buffer.from(await file.arrayBuffer());
	const created = await svc.createGenerator({
		problemId,
		userId,
		draftId: draft.id,
		name: nameRaw.trim(),
		language,
		source,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/generators`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	return created;
}

/**
 * Replace generator source via plain text (from the Monaco editor).
 */
export async function saveWorkshopGeneratorSource(
	problemId: number,
	generatorId: number,
	source: string
) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const updated = await svc.updateGeneratorSource({
		problemId,
		userId,
		draftId: draft.id,
		generatorId,
		source: Buffer.from(source, "utf-8"),
	});
	revalidatePath(`/workshop/${problemId}/generators`);
	return updated;
}

export async function deleteWorkshopGenerator(problemId: number, generatorId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	await svc.deleteGenerator({ problemId, userId, draftId: draft.id, generatorId });
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/generators`);
	revalidatePath(`/workshop/${problemId}/testcases`);
}
