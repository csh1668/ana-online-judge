export const LANGUAGE_VALUES = [
	"c",
	"cpp",
	"python",
	"pypy",
	"java",
	"rust",
	"go",
	"javascript",
	"csharp",
	"text",
] as const;

export type Language = (typeof LANGUAGE_VALUES)[number];

// Sync with judge/files/languages.toml
export interface LanguageConfig {
	label: string;
	version: string;
	defaultCode: string;
	sourceFile: string;
	fileExtension: string;
	monacoLanguage?: string;
	compileCommand?: string;
	runCommand: string;
	timeLimitFactor: [number, number];
	memoryLimitFactor: [number, number];
}

export const LANGUAGES: Record<Language, LanguageConfig> = {
	c: {
		label: "C",
		version: "GCC 14.2.0, C17",
		defaultCode: "#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}",
		sourceFile: "Main.c",
		fileExtension: "c",
		compileCommand: "gcc -o Main Main.c -O2 -Wall -lm -static -std=c17 -fpermissive -DONLINE_JUDGE",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	cpp: {
		label: "C++",
		version: "GCC 14.2.0, C++23",
		defaultCode:
			"#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}",
		sourceFile: "Main.cpp",
		fileExtension: "cpp",
		compileCommand: "g++ -o Main Main.cpp -O2 -Wall -lm -static -std=c++23 -DONLINE_JUDGE",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	python: {
		label: "Python",
		version: "Python 3.13.5",
		defaultCode: "",
		sourceFile: "Main.py",
		fileExtension: "py",
		monacoLanguage: "python",
		compileCommand: "python3 -m py_compile Main.py",
		runCommand: "python3 -W ignore Main.py",
		timeLimitFactor: [3, 2],
		memoryLimitFactor: [2, 32],
	},
	pypy: {
		label: "PyPy",
		version: "PyPy3 7.3.19 (Python 3.11)",
		defaultCode: "",
		sourceFile: "Main.py",
		fileExtension: "py",
		monacoLanguage: "python",
		compileCommand: "pypy3 -m py_compile Main.py",
		runCommand: "pypy3 -W ignore Main.py",
		timeLimitFactor: [2, 1],
		memoryLimitFactor: [2, 64],
	},
	java: {
		label: "Java",
		version: "OpenJDK 21",
		defaultCode:
			"import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}",
		sourceFile: "Main.java",
		fileExtension: "java",
		compileCommand: "javac -encoding UTF-8 Main.java",
		runCommand: "java -Xms128m -Xmx512m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC Main",
		timeLimitFactor: [2, 1],
		memoryLimitFactor: [2, 16],
	},
	rust: {
		label: "Rust",
		version: "Rust 1.98.1",
		defaultCode:
			"use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    \n}",
		sourceFile: "Main.rs",
		fileExtension: "rs",
		compileCommand: "rustc -O --edition=2024 -o Main Main.rs",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	go: {
		label: "Go",
		version: "Go 1.27.1",
		defaultCode: 'package main\n\nimport "fmt"\n\nfunc main() {\n    \n    fmt.Println()\n}',
		sourceFile: "Main.go",
		fileExtension: "go",
		compileCommand: "go build -o Main Main.go",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	javascript: {
		label: "JavaScript",
		version: "Node.js 22.23.2",
		defaultCode:
			"const fs = require('fs');\nconst input = fs.readFileSync('/dev/stdin').toString().trim().split('\\n');\n\n// Solution here\n",
		sourceFile: "Main.js",
		fileExtension: "js",
		runCommand: "node Main.js",
		timeLimitFactor: [3, 2],
		memoryLimitFactor: [2, 32],
	},
	csharp: {
		label: "C#",
		version: ".NET 10 (C# 14)",
		defaultCode: 'using System;\n\nConsole.WriteLine("Hello, World!");\n',
		sourceFile: "Main.cs",
		fileExtension: "cs",
		compileCommand: "dotnet build Main.cs --configuration Release -p:AllowUnsafeBlocks=true",
		runCommand: "dotnet Main.dll",
		timeLimitFactor: [2, 1],
		memoryLimitFactor: [2, 32],
	},
	text: {
		label: "Text",
		version: "",
		defaultCode: "",
		sourceFile: "Main.txt",
		fileExtension: "txt",
		monacoLanguage: "plaintext",
		runCommand: "cat Main.txt",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
};

/** LANGUAGES를 배열로 순회할 때 사용 */
export function getLanguageList() {
	return (Object.entries(LANGUAGES) as [Language, LanguageConfig][]).map(([value, config]) => ({
		value,
		...config,
	}));
}

/** Select / 필터용 {value, label} 페어. SelectItem 매핑에 사용. */
export function getLanguageOptions(): { value: Language; label: string }[] {
	return (Object.entries(LANGUAGES) as [Language, LanguageConfig][]).map(([value, config]) => ({
		value,
		label: config.label,
	}));
}

/** Submission/source 파일 확장자 (no leading dot). */
export function getFileExtension(language: Language): string {
	return LANGUAGES[language].fileExtension;
}

/** Monaco editor 언어 ID. 별도 설정이 없으면 enum 값을 그대로 사용. */
export function getMonacoLanguage(language: Language): string {
	return LANGUAGES[language].monacoLanguage ?? language;
}
