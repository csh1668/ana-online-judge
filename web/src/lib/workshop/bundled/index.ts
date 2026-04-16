import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url));

export const WORKSHOP_BUNDLED_TESTLIB_FILENAME = "testlib.h";

/**
 * Read a bundled workshop resource file (e.g. testlib.h) from disk.
 * These files ship inside the web container image.
 * Path is resolved relative to this module so Next.js output tracing can include them.
 */
export async function readBundledWorkshopResource(filename: string): Promise<Buffer> {
	return readFile(join(BUNDLE_DIR, filename));
}

/**
 * Identifiers for built-in checker presets. Matches the filenames (minus `.cpp`)
 * under `web/src/lib/workshop/bundled/checkers/`.
 */
export type WorkshopCheckerPreset = "icpc_diff" | "wcmp" | "rcmp4";

export const WORKSHOP_CHECKER_PRESETS: ReadonlyArray<{
	id: WorkshopCheckerPreset;
	label: string;
	description: string;
}> = [
	{
		id: "icpc_diff",
		label: "ICPC 기본 (토큰 비교)",
		description: "공백 무시 토큰 단위 정확 비교 (문제 생성 시 기본값)",
	},
	{
		id: "wcmp",
		label: "wcmp (testlib)",
		description: "testlib 표준 wcmp — 토큰 시퀀스 비교 (공백 무시)",
	},
	{
		id: "rcmp4",
		label: "rcmp4 (실수 비교, 1e-4)",
		description: "절대/상대 오차 1e-4 이내의 실수 시퀀스 비교",
	},
];

/**
 * Read a bundled checker C++ source by preset id.
 * Throws if the id is unknown.
 */
export async function readBundledCheckerSource(preset: WorkshopCheckerPreset): Promise<Buffer> {
	const allowed: ReadonlyArray<WorkshopCheckerPreset> = ["icpc_diff", "wcmp", "rcmp4"];
	if (!allowed.includes(preset)) {
		throw new Error(`Unknown checker preset: ${preset}`);
	}
	return readFile(join(BUNDLE_DIR, "checkers", `${preset}.cpp`));
}
