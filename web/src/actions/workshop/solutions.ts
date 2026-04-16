"use server";

import { revalidatePath } from "next/cache";
import type { Language } from "@/db/schema";
import { getLanguageList } from "@/lib/languages";
import * as svc from "@/lib/services/workshop-solutions";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";
import type { WorkshopExpectedVerdict } from "@/lib/workshop/expected-verdict";

export async function listWorkshopSolutions(problemId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const rows = await svc.listSolutionsForDraft(draft.id);
	return { draftId: draft.id, solutions: rows };
}

export async function readWorkshopSolutionSource(problemId: number, solutionId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	return svc.readSolutionSource(solutionId, draft.id);
}

export async function createWorkshopSolution(
	problemId: number,
	input: {
		name: string;
		language: Language;
		source: string;
		expectedVerdict: WorkshopExpectedVerdict;
		isMain: boolean;
	}
) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const created = await svc.createSolution({
		problemId,
		userId,
		draftId: draft.id,
		name: input.name.trim(),
		language: input.language,
		source: input.source,
		expectedVerdict: input.expectedVerdict,
		isMain: input.isMain,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
	return created;
}

export async function updateWorkshopSolution(
	problemId: number,
	solutionId: number,
	input: {
		name?: string;
		language?: Language;
		source?: string;
		expectedVerdict?: WorkshopExpectedVerdict;
	}
) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	const updated = await svc.updateSolution({
		problemId,
		userId,
		draftId: draft.id,
		solutionId,
		name: input.name?.trim(),
		language: input.language,
		source: input.source,
		expectedVerdict: input.expectedVerdict,
	});
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
	return updated;
}

export async function setWorkshopMainSolution(problemId: number, solutionId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	await svc.setMainSolution(draft.id, solutionId);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
}

export async function deleteWorkshopSolution(problemId: number, solutionId: number) {
	const { userId } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId);
	await svc.deleteSolution(draft.id, solutionId);
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/solutions`);
	revalidatePath(`/workshop/${problemId}/invocations`);
}

// const SOLUTION_LANGUAGES: Language[] = ["c", "cpp", "python", "java", "rust", "go", "javascript"];
const SOLUTION_LANGUAGES: Language[] = getLanguageList().map((v) => v.value);

const EXPECTED_VERDICT_VALUES: WorkshopExpectedVerdict[] = [
	"accepted",
	"wrong_answer",
	"time_limit",
	"memory_limit",
	"runtime_error",
	"presentation_error",
	"tl_or_ml",
];

function parseSolutionLanguage(raw: FormDataEntryValue | null): Language {
	if (typeof raw !== "string" || !(SOLUTION_LANGUAGES as string[]).includes(raw)) {
		throw new Error(`지원하지 않는 언어입니다: ${String(raw)}`);
	}
	return raw as Language;
}

function parseExpectedVerdict(raw: FormDataEntryValue | null): WorkshopExpectedVerdict {
	if (typeof raw !== "string" || !(EXPECTED_VERDICT_VALUES as string[]).includes(raw)) {
		throw new Error(`알 수 없는 예상 verdict: ${String(raw)}`);
	}
	return raw as WorkshopExpectedVerdict;
}

async function readFormSource(formData: FormData): Promise<string> {
	const file = formData.get("file");
	if (file instanceof File && file.size > 0) {
		const buf = Buffer.from(await file.arrayBuffer());
		if (buf.subarray(0, 8192).includes(0)) {
			throw new Error("솔루션 파일은 텍스트여야 합니다 (바이너리 불가)");
		}
		return buf.toString("utf-8");
	}
	const source = formData.get("source");
	if (typeof source !== "string" || source.length === 0) {
		throw new Error("소스 코드를 입력해주세요");
	}
	return source;
}

export async function createWorkshopSolutionFromForm(problemId: number, formData: FormData) {
	const nameRaw = formData.get("name");
	if (typeof nameRaw !== "string" || !nameRaw.trim()) {
		throw new Error("이름을 입력해주세요");
	}
	const language = parseSolutionLanguage(formData.get("language"));
	const expectedVerdict = parseExpectedVerdict(formData.get("expectedVerdict"));
	const isMain = formData.get("isMain") === "true";
	const source = await readFormSource(formData);

	return createWorkshopSolution(problemId, {
		name: nameRaw.trim(),
		language,
		source,
		expectedVerdict,
		isMain,
	});
}

export async function updateWorkshopSolutionFromForm(
	problemId: number,
	solutionId: number,
	formData: FormData
) {
	const patch: Parameters<typeof updateWorkshopSolution>[2] = {};

	const nameRaw = formData.get("name");
	if (typeof nameRaw === "string" && nameRaw.trim().length > 0) patch.name = nameRaw.trim();

	const languageRaw = formData.get("language");
	if (typeof languageRaw === "string") patch.language = parseSolutionLanguage(languageRaw);

	const expectedRaw = formData.get("expectedVerdict");
	if (typeof expectedRaw === "string") patch.expectedVerdict = parseExpectedVerdict(expectedRaw);

	const file = formData.get("file");
	const sourceRaw = formData.get("source");
	if ((file instanceof File && file.size > 0) || typeof sourceRaw === "string") {
		patch.source = await readFormSource(formData);
	}

	return updateWorkshopSolution(problemId, solutionId, patch);
}
