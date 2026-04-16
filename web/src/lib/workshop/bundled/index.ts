import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url));

export const WORKSHOP_BUNDLED_TESTLIB_FILENAME = "testlib.h";
export const WORKSHOP_BUNDLED_AOJ_CHECKER_FILENAME = "aoj_checker.py";

/**
 * Filenames of all default resources auto-seeded into a new draft's
 * `resources/` slot when `ensureWorkshopDraft` first runs.
 *
 * - `testlib.h` — competitive-programming C++ testlib for checkers/generators
 * - `aoj_checker.py` — AOJ Python checker SDK (Checker / Interactive classes)
 */
export const WORKSHOP_DEFAULT_RESOURCE_FILENAMES = [
	WORKSHOP_BUNDLED_TESTLIB_FILENAME,
	WORKSHOP_BUNDLED_AOJ_CHECKER_FILENAME,
] as const;

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

/**
 * Identifiers for built-in generator starter templates. Matches the filenames
 * under `web/src/lib/workshop/bundled/generators/`.
 *
 * These templates demonstrate the AOJ Workshop convention: the workshop seed
 * (hex string) is appended as the LAST positional argument when invoking a
 * generator. The C++ template uses testlib.h's `registerGen` to consume it
 * automatically; the Python template uses an `nargs='?'` argparse slot so
 * strict argparse-based generators don't reject the injected seed.
 */
export const WORKSHOP_GENERATOR_TEMPLATES = ["cpp", "python"] as const;
export type WorkshopGeneratorTemplate = (typeof WORKSHOP_GENERATOR_TEMPLATES)[number];

const GENERATOR_TEMPLATE_FILENAMES: Record<WorkshopGeneratorTemplate, string> = {
	cpp: "template_cpp.cpp",
	python: "template_python.py",
};

export async function readBundledGeneratorTemplate(
	template: WorkshopGeneratorTemplate
): Promise<string> {
	if (!(WORKSHOP_GENERATOR_TEMPLATES as ReadonlyArray<string>).includes(template)) {
		throw new Error(`Unknown generator template: ${template}`);
	}
	const buf = await readBundledWorkshopResource(
		`generators/${GENERATOR_TEMPLATE_FILENAMES[template]}`
	);
	return buf.toString("utf-8");
}

/**
 * Identifiers for built-in validator starter templates. Matches filenames
 * (minus `.cpp`) under `web/src/lib/workshop/bundled/validators/`.
 */
export type WorkshopValidatorPreset = "testlib";

export const WORKSHOP_VALIDATOR_PRESETS: ReadonlyArray<{
	id: WorkshopValidatorPreset;
	label: string;
	description: string;
}> = [
	{
		id: "testlib",
		label: "testlib 보일러플레이트",
		description: "registerValidation + inf.readInt/readEoln/readEof 예시",
	},
];

export async function readBundledValidatorSource(preset: WorkshopValidatorPreset): Promise<Buffer> {
	if (preset !== "testlib") throw new Error(`Unknown validator preset: ${preset}`);
	return readFile(join(BUNDLE_DIR, "validators", "testlib.cpp"));
}
