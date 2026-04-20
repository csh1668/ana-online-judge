import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageCode, TranslateInput } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROMPT_PATH = path.join(__dirname, "prompts", "ko.md");

let cachedSystemPrompt: string | null = null;

export function loadSystemPrompt(customPath?: string): string {
	if (!customPath && cachedSystemPrompt) return cachedSystemPrompt;
	const filePath = customPath ?? DEFAULT_PROMPT_PATH;
	const content = fs.readFileSync(filePath, "utf-8");
	if (!customPath) cachedSystemPrompt = content;
	return content;
}

const LANG_LABEL: Record<LanguageCode, string> = {
	ko: "한국어",
	en: "영어",
	ja: "일본어",
	pl: "폴란드어",
	hr: "크로아티아어",
};

/**
 * 사용자 메시지 빌더.
 * 시스템 프롬프트는 정적이므로 인물 목록은 여기에 동적으로 들어간다.
 */
export function buildUserMessage(input: TranslateInput): string {
	const charLine =
		input.characterNames.length > 0
			? `사용 가능한 인물 이름: ${input.characterNames.join(", ")}`
			: "사용 가능한 인물 이름: (제공되지 않음 — 한국식 일반 이름 사용)";

	const sourceLabel = LANG_LABEL[input.sourceLang] ?? input.sourceLang;

	return [
		charLine,
		"",
		`원문 언어: ${sourceLabel}`,
		`원문 제목: ${input.sourceTitle}`,
		"",
		"원문 본문:",
		input.sourceContent,
	].join("\n");
}
