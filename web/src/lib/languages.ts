import type { Language } from "@/db/schema";

export interface LanguageConfig {
	value: Language;
	label: string;
	defaultCode: string;
}

export const LANGUAGES: LanguageConfig[] = [
	{
		value: "cpp",
		label: "C++",
		defaultCode:
			"#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}",
	},
	{
		value: "c",
		label: "C",
		defaultCode: "#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}",
	},
	{
		value: "python",
		label: "Python",
		defaultCode: "# Python 3\n\n",
	},
	{
		value: "java",
		label: "Java",
		defaultCode:
			"import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}",
	},
];

/** Monaco Editor 언어 매핑 */
export const LANGUAGE_MAP: Record<Language, string> = {
	cpp: "cpp",
	c: "c",
	python: "python",
	java: "java",
};

/** 언어 레이블 (표시용) */
export const LANGUAGE_LABELS: Record<Language, string> = {
	c: "C",
	cpp: "C++",
	python: "Python",
	java: "Java",
};
