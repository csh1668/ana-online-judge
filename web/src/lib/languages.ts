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
		defaultCode: "",
	},
	{
		value: "java",
		label: "Java",
		defaultCode:
			"import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}",
	},
	{
		value: "javascript",
		label: "JavaScript",
		defaultCode:
			"const fs = require('fs');\nconst input = fs.readFileSync('/dev/stdin').toString().trim().split('\\n');\n\n// Solution here\n",
	},
	{
		value: "text",
		label: "Text",
		defaultCode: "",
	},
];
