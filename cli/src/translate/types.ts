export type LanguageCode = "ko" | "en" | "ja" | "pl" | "hr";

export interface Translation {
	title: string;
	content: string;
	translatorId?: number | null;
	createdAt: string;
	updatedAt: string;
}

export interface Translations {
	original: LanguageCode;
	entries: Partial<Record<LanguageCode, Translation>>;
}

export interface TranslateInput {
	problemId: number;
	sourceLang: LanguageCode;
	sourceTitle: string;
	sourceContent: string;
	characterNames: string[]; // 무작위 5명
}

export interface TranslateOutput {
	title: string;
	content: string;
}

export interface Failure {
	problemId: number;
	reason: string;
}
