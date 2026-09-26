import type { LanguageRow } from "@/db/schema";

export type Language = string;

export interface LanguageOption {
	value: string;
	label: string;
}

export interface LanguageEditorInfo {
	value: string;
	label: string;
	version: string;
	defaultCode: string;
	sourceFile: string;
	fileExtension: string;
	monacoLanguage: string;
}

export function toEditorInfo(
	row: Pick<
		LanguageRow,
		"id" | "label" | "version" | "defaultCode" | "sourceFile" | "fileExtension" | "monacoLanguage"
	>
): LanguageEditorInfo {
	return {
		value: row.id,
		label: row.label,
		version: row.version,
		defaultCode: row.defaultCode,
		sourceFile: row.sourceFile,
		fileExtension: row.fileExtension,
		monacoLanguage: row.monacoLanguage ?? row.id,
	};
}

/** Monaco editor 언어 ID. */
export function getMonacoLanguage(info: LanguageEditorInfo): string {
	return info.monacoLanguage;
}
