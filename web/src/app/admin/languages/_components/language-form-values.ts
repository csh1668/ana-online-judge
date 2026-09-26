import type { LanguageAdminRow, LanguageInput } from "@/lib/services/languages";

/** 폼 내부 상태 — 모든 입력은 문자열/불리언으로 들고, 제출 시 payload로 변환한다. */
export type LanguageFormValues = {
	id: string;
	label: string;
	version: string;
	aliases: string;
	sortOrder: string;
	enabled: boolean;
	sourceFile: string;
	fileExtension: string;
	monacoLanguage: string;
	defaultCode: string;
	compileCommand: string;
	runCommand: string;
	displayCompileCommand: string;
	displayRunCommand: string;
	clientCompileCommand: string;
	clientRunCommand: string;
	producesSingleBinary: boolean;
	env: string;
	timeMultiplier: string;
	timeBonusMs: string;
	memoryMultiplier: string;
	memoryBonusMb: string;
	compileOnHost: boolean;
	compileScript: string;
	installScript: string;
};

export type TextKey = {
	[K in keyof LanguageFormValues]: LanguageFormValues[K] extends string ? K : never;
}[keyof LanguageFormValues];
export type BoolKey = {
	[K in keyof LanguageFormValues]: LanguageFormValues[K] extends boolean ? K : never;
}[keyof LanguageFormValues];

export function toFormValues(row?: LanguageAdminRow): LanguageFormValues {
	return {
		id: row?.id ?? "",
		label: row?.label ?? "",
		version: row?.version ?? "",
		aliases: row?.aliases.join(", ") ?? "",
		sortOrder: String(row?.sortOrder ?? 0),
		enabled: row?.enabled ?? false,
		sourceFile: row?.sourceFile ?? "",
		fileExtension: row?.fileExtension ?? "",
		monacoLanguage: row?.monacoLanguage ?? "",
		defaultCode: row?.defaultCode ?? "",
		compileCommand: row?.compileCommand ?? "",
		runCommand: row?.runCommand ?? "",
		displayCompileCommand: row?.displayCompileCommand ?? "",
		displayRunCommand: row?.displayRunCommand ?? "",
		clientCompileCommand: row?.clientCompileCommand ?? "",
		clientRunCommand: row?.clientRunCommand ?? "",
		producesSingleBinary: row?.producesSingleBinary ?? true,
		env: row?.env.join("\n") ?? "",
		timeMultiplier: row?.timeMultiplier ?? "1",
		timeBonusMs: String(row?.timeBonusMs ?? 0),
		memoryMultiplier: row?.memoryMultiplier ?? "1",
		memoryBonusMb: String(row?.memoryBonusMb ?? 0),
		compileOnHost: row?.compileOnHost ?? false,
		compileScript: row?.compileScript ?? "",
		installScript: row?.installScript ?? "",
	};
}

const orNull = (s: string) => (s.trim() === "" ? null : s);
/** 빈 입력은 NaN으로 넘겨 서버 zod 검증이 거부하게 한다. */
const toInt = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

/** 폼 값 → 액션 payload. id는 포함하지 않는다(생성 시 호출부가 붙인다). 빈 installScript는 null(내장). */
export function toPayload(v: LanguageFormValues): Omit<LanguageInput, "id"> {
	return {
		label: v.label.trim(),
		version: v.version.trim(),
		aliases: v.aliases
			.split(",")
			.map((a) => a.trim())
			.filter(Boolean),
		sortOrder: toInt(v.sortOrder),
		enabled: v.enabled,
		sourceFile: v.sourceFile.trim(),
		fileExtension: v.fileExtension.trim(),
		monacoLanguage: orNull(v.monacoLanguage.trim()),
		defaultCode: v.defaultCode,
		compileCommand: orNull(v.compileCommand),
		runCommand: v.runCommand,
		displayCompileCommand: orNull(v.displayCompileCommand),
		displayRunCommand: orNull(v.displayRunCommand),
		clientCompileCommand: orNull(v.clientCompileCommand),
		clientRunCommand: orNull(v.clientRunCommand),
		producesSingleBinary: v.producesSingleBinary,
		env: v.env
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean),
		timeMultiplier: v.timeMultiplier.trim(),
		timeBonusMs: toInt(v.timeBonusMs),
		memoryMultiplier: v.memoryMultiplier.trim(),
		memoryBonusMb: toInt(v.memoryBonusMb),
		compileOnHost: v.compileOnHost,
		compileScript: orNull(v.compileScript),
		installScript: orNull(v.installScript),
	};
}

/** 서버 액션 에러 → 사용자 메시지. zod 에러는 message가 이슈 배열 JSON이므로 첫 이슈만 보여준다. */
export function errorMessage(err: unknown, fallback: string): string {
	if (!(err instanceof Error)) return fallback;
	try {
		const issues = JSON.parse(err.message) as { path?: unknown[]; message?: string }[];
		const first = Array.isArray(issues) ? issues[0] : undefined;
		if (first?.message) {
			const path = first.path?.length ? `${first.path.join(".")}: ` : "";
			return `${path}${first.message}`;
		}
	} catch {
		// not JSON — plain message
	}
	return err.message || fallback;
}
