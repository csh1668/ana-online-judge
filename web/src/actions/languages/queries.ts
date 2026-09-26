"use server";

import { type LanguageEditorInfo, type LanguageOption, toEditorInfo } from "@/lib/languages";
import { getActiveLanguages, getLanguage, getLanguageLabelMap } from "@/lib/services/languages";

export async function getActiveLanguageOptions(): Promise<LanguageOption[]> {
	return (await getActiveLanguages()).map((r) => ({ value: r.id, label: r.label }));
}

export async function getActiveLanguageEditorInfos(): Promise<LanguageEditorInfo[]> {
	return (await getActiveLanguages()).map(toEditorInfo);
}

export async function getLanguageLabelMapAction(): Promise<Record<string, string>> {
	return getLanguageLabelMap();
}

/** 비활성·삭제 언어 포함 단일 언어 에디터 정보 (과거 제출 표시용). 없으면 null. */
export async function getLanguageEditorInfoAction(id: string): Promise<LanguageEditorInfo | null> {
	const row = await getLanguage(id);
	return row ? toEditorInfo(row) : null;
}

export interface JudgeInfoLanguage {
	id: string;
	label: string;
	version: string;
	sourceFile: string;
	compileCommand: string | null;
	runCommand: string;
	timeMultiplier: number;
	timeBonusSec: number;
	memoryMultiplier: number;
	memoryBonusMb: number;
}

/** 표시용 명령에서 샌드박스 내부 placeholder를 정리한다. */
function cleanDisplayCommand(cmd: string): string {
	return cmd
		.replace(/\{prefix\}\/?/g, "")
		.replace(/\s?\{include_flags\}/g, "")
		.replace("{heap_mb}", "512");
}

/** /judge-info 표시용. 스크립트·env 등 내부 컬럼은 포함하지 않는다. */
export async function getJudgeInfoLanguages(): Promise<JudgeInfoLanguage[]> {
	return (await getActiveLanguages()).map((r) => {
		const compile = r.displayCompileCommand ?? r.compileCommand;
		return {
			id: r.id,
			label: r.label,
			version: r.version,
			sourceFile: r.sourceFile,
			compileCommand: compile ? cleanDisplayCommand(compile) : null,
			runCommand: cleanDisplayCommand(r.displayRunCommand ?? r.runCommand),
			timeMultiplier: Number(r.timeMultiplier),
			timeBonusSec: r.timeBonusMs / 1000,
			memoryMultiplier: Number(r.memoryMultiplier),
			memoryBonusMb: r.memoryBonusMb,
		};
	});
}
