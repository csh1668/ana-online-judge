"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/services/workshop-testcases";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { getActiveDraftForUser } from "@/lib/workshop/drafts";

export async function listWorkshopTestcases(problemId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);
	const rows = await svc.listTestcasesForDraft(draft.id);
	return { draftId: draft.id, testcases: rows };
}

export async function readWorkshopTestcaseContent(args: { problemId: number; testcaseId: number }) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(args.problemId, userId, isAdmin);
	return svc.readTestcaseContent({ draftId: draft.id, testcaseId: args.testcaseId });
}

function parseOptionalInt(raw: FormDataEntryValue | null, fallback: number): number {
	if (typeof raw !== "string" || raw.trim() === "") return fallback;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) ? n : fallback;
}

export async function createWorkshopManualTestcase(problemId: number, formData: FormData) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);

	const inputFile = formData.get("inputFile");
	const outputFile = formData.get("outputFile");
	if (!(inputFile instanceof File)) {
		throw new Error("입력 파일을 선택해주세요");
	}
	const input = Buffer.from(await inputFile.arrayBuffer());
	const output =
		outputFile instanceof File && outputFile.size > 0
			? Buffer.from(await outputFile.arrayBuffer())
			: null;

	const created = await svc.createManualTestcase({
		problemId,
		userId,
		draftId: draft.id,
		input,
		output,
		subtaskGroup: parseOptionalInt(formData.get("subtaskGroup"), 0),
		score: parseOptionalInt(formData.get("score"), 0),
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	return created;
}

export async function updateWorkshopTestcase(
	problemId: number,
	testcaseId: number,
	formData: FormData
) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);

	const newInputFile = formData.get("inputFile");
	const newOutputFile = formData.get("outputFile");
	const clearOutput = formData.get("clearOutput") === "true";

	const newInput =
		newInputFile instanceof File && newInputFile.size > 0
			? Buffer.from(await newInputFile.arrayBuffer())
			: undefined;
	let newOutput: Buffer | null | undefined;
	if (clearOutput) {
		newOutput = null;
	} else if (newOutputFile instanceof File && newOutputFile.size > 0) {
		newOutput = Buffer.from(await newOutputFile.arrayBuffer());
	} else {
		newOutput = undefined;
	}

	const updated = await svc.updateTestcase({
		problemId,
		userId,
		draftId: draft.id,
		testcaseId,
		subtaskGroup: parseOptionalInt(formData.get("subtaskGroup"), 0),
		score: parseOptionalInt(formData.get("score"), 0),
		newInput,
		newOutput,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	return updated;
}

export async function deleteWorkshopTestcase(problemId: number, testcaseId: number) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);
	await svc.deleteTestcase({
		problemId,
		userId,
		draftId: draft.id,
		testcaseId,
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/testcases`);
}

export async function bulkUploadWorkshopTestcases(problemId: number, formData: FormData) {
	const { userId, isAdmin } = await requireWorkshopAccess();
	const draft = await getActiveDraftForUser(problemId, userId, isAdmin);

	const zipFile = formData.get("zipFile");
	if (!(zipFile instanceof File) || zipFile.size === 0) {
		throw new Error("ZIP 파일을 선택해주세요");
	}
	const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
	const pairs = await svc.parseTestcaseZip(zipBuffer);

	const created = await svc.bulkCreateManualTestcases({
		problemId,
		userId,
		draftId: draft.id,
		pairs,
		defaultScore: parseOptionalInt(formData.get("defaultScore"), 0),
		defaultSubtaskGroup: parseOptionalInt(formData.get("defaultSubtaskGroup"), 0),
	});
	revalidatePath(`/workshop/${problemId}`);
	revalidatePath(`/workshop/${problemId}/testcases`);
	return { count: created.length };
}
