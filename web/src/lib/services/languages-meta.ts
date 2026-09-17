import "server-only";

/**
 * Static mirror of judge/files/languages.toml.
 *
 * When judge/files/languages.toml is updated (language added / removed / command changed),
 * this file MUST be updated manually to keep the VS Code extension in sync.
 *
 * ─── Placeholder convention ────────────────────────────────────────────────
 * The TOML targets the isolate sandbox, so several values are abstracted here
 * for cross-platform client use:
 *
 *   {src}        — absolute path to the source file  (e.g. /home/user/proj/Main.cpp)
 *   {exe}        — absolute path for the output binary (no extension; add .exe on Windows
 *                  in the extension's spawn logic, not here)
 *   {srcDir}     — directory containing the source file
 *   {className}  — Java main class name (basename of {src} without the .java extension)
 *
 * Mapping from TOML to these placeholders:
 *   TOML `{include_flags}`         → omitted (sandbox-internal, not applicable client-side)
 *   TOML absolute tool paths       → plain binary name (javac, java, rustc …)
 *                                    clients are expected to have these on $PATH
 *   TOML hard-coded file names     → replaced with {src} / {exe} / {srcDir}
 *     "Main.c"  → {src}
 *     "./Main"  → {exe}
 *   TOML toolchain-specific flags  → omitted (not part of the language contract)
 *     "-static"       → dropped; static linking is unavailable on macOS
 *     "-fpermissive"  → dropped; a GCC-14 C-mode compatibility flag that clang
 *                       rejects outright. Local C is thus slightly stricter
 *                       than the judge, never looser.
 * ───────────────────────────────────────────────────────────────────────────
 */

export interface LanguageMeta {
	/** Canonical ID — matches languageEnum in the database. */
	id: string;
	displayName: string;
	/** All accepted aliases (including id itself). */
	aliases: string[];
	version: string;
	fileExtensions: string[];
	defaultExtension: string;
	sourceFile: string;
	/** Absent for purely interpreted languages (javascript, text). */
	compile?: { command: string; args: string[] };
	run: { command: string; args: string[] };
	timeMultiplier: number;
	timeAddSec: number;
	memoryMultiplier: number;
	memoryAddMb: number;
}

/**
 * Mirror of judge/files/languages.toml.
 * Order matches LANGUAGE_VALUES in web/src/lib/languages.ts.
 */
export const LANGUAGES_META: LanguageMeta[] = [
	{
		id: "c",
		displayName: "C",
		aliases: ["c"],
		version: "GCC 14.2.0, C17",
		fileExtensions: ["c"],
		defaultExtension: "c",
		sourceFile: "Main.c",
		compile: {
			command: "gcc",
			args: ["-o", "{exe}", "{src}", "-O2", "-Wall", "-lm", "-std=c17", "-DONLINE_JUDGE"],
		},
		run: { command: "{exe}", args: [] },
		timeMultiplier: 1,
		timeAddSec: 0,
		memoryMultiplier: 1,
		memoryAddMb: 0,
	},
	{
		id: "cpp",
		displayName: "C++",
		aliases: ["cpp", "c++", "cpp17", "cpp20", "cpp23"],
		version: "GCC 14.2.0, C++23",
		fileExtensions: ["cpp", "cc", "cxx"],
		defaultExtension: "cpp",
		sourceFile: "Main.cpp",
		compile: {
			command: "g++",
			args: ["-o", "{exe}", "{src}", "-O2", "-Wall", "-lm", "-std=c++23", "-DONLINE_JUDGE"],
		},
		run: { command: "{exe}", args: [] },
		timeMultiplier: 1,
		timeAddSec: 0,
		memoryMultiplier: 1,
		memoryAddMb: 0,
	},
	{
		id: "python",
		displayName: "Python",
		aliases: ["python", "python3", "py"],
		version: "Python 3.13.5",
		fileExtensions: ["py"],
		defaultExtension: "py",
		sourceFile: "Main.py",
		// syntax-check compile step (mirrors py_compile in TOML)
		compile: {
			command: "python3",
			args: ["-m", "py_compile", "{src}"],
		},
		run: { command: "python3", args: ["-W", "ignore", "{src}"] },
		timeMultiplier: 3,
		timeAddSec: 2,
		memoryMultiplier: 2,
		memoryAddMb: 32,
	},
	{
		id: "pypy",
		displayName: "PyPy",
		aliases: ["pypy", "pypy3"],
		version: "PyPy3 7.3.19 (Python 3.11)",
		fileExtensions: ["py"],
		defaultExtension: "py",
		sourceFile: "Main.py",
		compile: {
			command: "pypy3",
			args: ["-m", "py_compile", "{src}"],
		},
		run: { command: "pypy3", args: ["-W", "ignore", "{src}"] },
		timeMultiplier: 2,
		timeAddSec: 1,
		memoryMultiplier: 2,
		memoryAddMb: 64,
	},
	{
		id: "java",
		displayName: "Java",
		aliases: ["java"],
		version: "OpenJDK 21",
		fileExtensions: ["java"],
		defaultExtension: "java",
		sourceFile: "Main.java",
		// TOML uses absolute path /usr/lib/jvm/java-21-openjdk-amd64/bin/javac — abstracted to
		// plain `javac`; extension resolves via $PATH / JAVA_HOME.
		compile: {
			command: "javac",
			args: ["-encoding", "UTF-8", "{src}"],
		},
		// Class name = basename of source without .java extension ({className} placeholder).
		// CWD for the run command must be {srcDir} so the JVM can find the compiled .class file.
		run: {
			command: "java",
			args: [
				"-Xms128m",
				"-Xmx512m",
				"-Xss64m",
				"-Dfile.encoding=UTF-8",
				"-XX:+UseSerialGC",
				"-cp",
				"{srcDir}",
				"{className}",
			],
		},
		timeMultiplier: 2,
		timeAddSec: 1,
		memoryMultiplier: 2,
		memoryAddMb: 16,
	},
	{
		id: "rust",
		displayName: "Rust",
		aliases: ["rust", "rs"],
		version: "Rust 1.98.1",
		fileExtensions: ["rs"],
		defaultExtension: "rs",
		sourceFile: "Main.rs",
		// TOML uses absolute toolchain path — abstracted to `rustc` on $PATH.
		compile: {
			command: "rustc",
			args: ["-O", "--edition=2024", "-o", "{exe}", "{src}"],
		},
		run: { command: "{exe}", args: [] },
		timeMultiplier: 1,
		timeAddSec: 0,
		memoryMultiplier: 1,
		memoryAddMb: 0,
	},
	{
		id: "go",
		displayName: "Go",
		aliases: ["go", "golang"],
		version: "Go 1.27.1",
		fileExtensions: ["go"],
		defaultExtension: "go",
		sourceFile: "Main.go",
		compile: {
			command: "go",
			args: ["build", "-o", "{exe}", "{src}"],
		},
		run: { command: "{exe}", args: [] },
		timeMultiplier: 1,
		timeAddSec: 0,
		memoryMultiplier: 1,
		memoryAddMb: 0,
	},
	{
		id: "javascript",
		displayName: "JavaScript",
		aliases: ["javascript", "js", "node", "nodejs"],
		version: "Node.js 22.23.2",
		fileExtensions: ["js", "mjs"],
		defaultExtension: "js",
		sourceFile: "Main.js",
		// No compile step in TOML.
		run: { command: "node", args: ["{src}"] },
		timeMultiplier: 3,
		timeAddSec: 2,
		memoryMultiplier: 2,
		memoryAddMb: 32,
	},
	{
		id: "csharp",
		displayName: "C#",
		aliases: ["csharp", "cs", "c#", "dotnet"],
		version: ".NET 10 (C# 14)",
		fileExtensions: ["cs"],
		defaultExtension: "cs",
		sourceFile: "Main.cs",
		// TOML uses a wrapper script /usr/local/bin/aoj-cs-compile (sandbox-specific).
		// Abstracted to a standard `dotnet build` invocation for client-side use.
		compile: {
			command: "dotnet",
			args: ["build", "{src}", "--configuration", "Release"],
		},
		run: { command: "dotnet", args: ["{exe}.dll"] },
		timeMultiplier: 2,
		timeAddSec: 1,
		memoryMultiplier: 2,
		memoryAddMb: 32,
	},
	{
		id: "text",
		displayName: "Text",
		aliases: ["text", "txt"],
		version: "",
		fileExtensions: ["txt"],
		defaultExtension: "txt",
		sourceFile: "Main.txt",
		// No compile step.
		run: { command: "cat", args: ["{src}"] },
		timeMultiplier: 1,
		timeAddSec: 0,
		memoryMultiplier: 1,
		memoryAddMb: 0,
	},
];

export function getLanguagesMeta(): { languages: LanguageMeta[] } {
	return { languages: LANGUAGES_META };
}
