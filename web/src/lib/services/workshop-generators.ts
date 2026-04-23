import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type WorkshopGenerator, workshopGenerators } from "@/db/schema";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage/operations";
import {
	workshopDraftGeneratorBinaryPath,
	workshopDraftGeneratorSourcePath,
} from "@/lib/workshop/paths";

const MAX_GENERATOR_BYTES = 2 * 1024 * 1024; // 2MB — more than enough for source
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const RESERVED_NAMES = new Set(["main", "checker", "validator"]);

export type GeneratorLanguage =
	| "c"
	| "cpp"
	| "python"
	| "java"
	| "rust"
	| "go"
	| "javascript"
	| "csharp";

const LANG_EXT: Record<GeneratorLanguage, string> = {
	c: "c",
	cpp: "cpp",
	python: "py",
	java: "java",
	rust: "rs",
	go: "go",
	javascript: "js",
	csharp: "cs",
};

function assertValidName(name: string): void {
	if (!NAME_PATTERN.test(name)) {
		throw new Error(
			"제너레이터 이름은 영문/숫자/언더바/하이픈만 사용 가능하며, 영문 또는 _ 로 시작해야 합니다 (1–64자)"
		);
	}
	if (RESERVED_NAMES.has(name)) {
		throw new Error(
			`"${name}"은(는) 예약된 이름이므로 사용할 수 없습니다 (main, checker, validator)`
		);
	}
}

function langExt(language: GeneratorLanguage): string {
	return LANG_EXT[language];
}

export async function listGeneratorsForDraft(draftId: number): Promise<WorkshopGenerator[]> {
	return db
		.select()
		.from(workshopGenerators)
		.where(eq(workshopGenerators.draftId, draftId))
		.orderBy(asc(workshopGenerators.name));
}

export async function getGenerator(
	generatorId: number,
	draftId: number
): Promise<WorkshopGenerator | null> {
	const [row] = await db
		.select()
		.from(workshopGenerators)
		.where(and(eq(workshopGenerators.id, generatorId), eq(workshopGenerators.draftId, draftId)))
		.limit(1);
	return row ?? null;
}

export async function readGeneratorSource(
	draftId: number,
	generatorId: number
): Promise<{ name: string; language: string; content: string }> {
	const row = await getGenerator(generatorId, draftId);
	if (!row) throw new Error("제너레이터를 찾을 수 없습니다");
	const buf = await downloadFile(row.sourcePath);
	return { name: row.name, language: row.language, content: buf.toString("utf-8") };
}

export async function createGenerator(params: {
	problemId: number;
	userId: number;
	draftId: number;
	name: string;
	language: GeneratorLanguage;
	source: Buffer;
}): Promise<WorkshopGenerator> {
	assertValidName(params.name);
	if (params.source.byteLength > MAX_GENERATOR_BYTES) {
		throw new Error("제너레이터 소스 파일은 최대 2MB까지 업로드 가능합니다");
	}

	const [collision] = await db
		.select({ id: workshopGenerators.id })
		.from(workshopGenerators)
		.where(
			and(eq(workshopGenerators.draftId, params.draftId), eq(workshopGenerators.name, params.name))
		)
		.limit(1);
	if (collision) {
		throw new Error("같은 이름의 제너레이터가 이미 존재합니다");
	}

	const ext = langExt(params.language);
	const sourcePath = workshopDraftGeneratorSourcePath(
		params.problemId,
		params.userId,
		params.name,
		ext
	);
	await uploadFile(sourcePath, params.source, "text/plain");

	const [created] = await db
		.insert(workshopGenerators)
		.values({
			draftId: params.draftId,
			name: params.name,
			language: params.language,
			sourcePath,
			compiledPath: null,
		})
		.returning();
	return created;
}

/**
 * Replace the source file of an existing generator. Language must not change
 * (to avoid having a stale file under the old extension sitting in MinIO).
 * Deleting + re-creating is the correct path when the user wants to switch
 * language.
 */
export async function updateGeneratorSource(params: {
	problemId: number;
	userId: number;
	draftId: number;
	generatorId: number;
	source: Buffer;
}): Promise<WorkshopGenerator> {
	if (params.source.byteLength > MAX_GENERATOR_BYTES) {
		throw new Error("제너레이터 소스 파일은 최대 2MB까지 업로드 가능합니다");
	}
	const existing = await getGenerator(params.generatorId, params.draftId);
	if (!existing) throw new Error("제너레이터를 찾을 수 없습니다");

	await uploadFile(existing.sourcePath, params.source, "text/plain");

	// Bump updatedAt and clear any stale compiled artifact reference — the
	// judge recompiles per invocation, but keeping the DB honest avoids
	// misleading UI.
	const [updated] = await db
		.update(workshopGenerators)
		.set({ updatedAt: new Date(), compiledPath: null })
		.where(eq(workshopGenerators.id, params.generatorId))
		.returning();
	return updated;
}

export async function deleteGenerator(params: {
	problemId: number;
	userId: number;
	draftId: number;
	generatorId: number;
}): Promise<void> {
	const existing = await getGenerator(params.generatorId, params.draftId);
	if (!existing) throw new Error("제너레이터를 찾을 수 없습니다");

	try {
		await deleteFile(existing.sourcePath);
	} catch (err) {
		// best-effort — the row delete below still progresses
		console.warn("[workshop-generators] source delete failed:", err);
	}
	if (existing.compiledPath) {
		try {
			await deleteFile(existing.compiledPath);
		} catch {
			// ignore
		}
		// Preserve the compiled path value in case the user wants to keep it
		// — but since the row is about to be deleted, no-op.
	}
	await db.delete(workshopGenerators).where(eq(workshopGenerators.id, params.generatorId));
	// The helper below is exported for the script-runner. Name resolution
	// happens in-memory after listing — no per-request DB roundtrip needed.
	void workshopDraftGeneratorBinaryPath; // keep import used
}

/**
 * Index generators by name for the script runner.
 */
export function indexByName(rows: WorkshopGenerator[]): Map<string, WorkshopGenerator> {
	const map = new Map<string, WorkshopGenerator>();
	for (const r of rows) map.set(r.name, r);
	return map;
}

export async function countGeneratorsForDraft(draftId: number): Promise<number> {
	const rows = await db
		.select({ id: workshopGenerators.id })
		.from(workshopGenerators)
		.where(eq(workshopGenerators.draftId, draftId));
	return rows.length;
}
