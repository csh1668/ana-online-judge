import type { Language } from "@/db/schema";

// Sync with judge/files/languages.toml
export interface LanguageConfig {
	label: string;
	version: string;
	defaultCode: string;
	sourceFile: string;
	compileCommand?: string;
	runCommand: string;
	timeLimitFactor: [number, number];
	memoryLimitFactor: [number, number];
}

export const LANGUAGES: Record<Language, LanguageConfig> = {
	c: {
		label: "C",
		version: "GCC 12.2.0, C17",
		defaultCode: "#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}",
		sourceFile: "Main.c",
		compileCommand: "gcc -o Main Main.c -O2 -Wall -lm -static -std=c17 -DONLINE_JUDGE",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	cpp: {
		label: "C++",
		version: "GCC 12.2.0, C++20",
		defaultCode:
			"#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}",
		sourceFile: "Main.cpp",
		compileCommand: "g++ -o Main Main.cpp -O2 -Wall -lm -static -std=c++20 -DONLINE_JUDGE",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	python: {
		label: "Python",
		version: "Python 3.11.2",
		defaultCode: "",
		sourceFile: "Main.py",
		compileCommand: "python3 -m py_compile Main.py",
		runCommand: "python3 -W ignore Main.py",
		timeLimitFactor: [3, 2],
		memoryLimitFactor: [2, 32],
	},
	java: {
		label: "Java",
		version: "OpenJDK 17",
		defaultCode:
			"import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}",
		sourceFile: "Main.java",
		compileCommand: "javac -encoding UTF-8 Main.java",
		runCommand: "java -Xms128m -Xmx512m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC Main",
		timeLimitFactor: [2, 1],
		memoryLimitFactor: [2, 16],
	},
	rust: {
		label: "Rust",
		version: "Rust 1.91.1",
		defaultCode:
			"use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    \n}",
		sourceFile: "Main.rs",
		compileCommand: "rustc -O -o Main Main.rs",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	go: {
		label: "Go",
		version: "Go 1.19.8",
		defaultCode: 'package main\n\nimport "fmt"\n\nfunc main() {\n    \n    fmt.Println()\n}',
		sourceFile: "Main.go",
		compileCommand: "go build -o Main Main.go",
		runCommand: "./Main",
		timeLimitFactor: [1, 0],
		memoryLimitFactor: [1, 0],
	},
	javascript: {
		label: "JavaScript",
		version: "Node.js 18.20.4",
		defaultCode:
			"const fs = require('fs');\nconst input = fs.readFileSync('/dev/stdin').toString().trim().split('\\n');\n\n// Solution here\n",
		sourceFile: "Main.js",
		runCommand: "node Main.js",
		timeLimitFactor: [3, 2],
		memoryLimitFactor: [2, 32],
	},
	text: {
		label: "Text",
		version: "",
		defaultCode: "",
		sourceFile: "Main.txt",
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
