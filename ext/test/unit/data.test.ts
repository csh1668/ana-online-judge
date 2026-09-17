import { describe, expect, it } from "vitest";
import { LANGUAGES, type LanguageDef } from "../../src/languages/data";

describe("LANGUAGES static table", () => {
	const ids = ["c", "cpp", "python", "pypy", "java", "rust", "go", "javascript", "csharp", "text"];

	it("contains all expected language ids in order", () => {
		expect(LANGUAGES.map((l) => l.id)).toEqual(ids);
	});

	it("every language has unique id and non-empty displayName", () => {
		const seen = new Set<string>();
		for (const l of LANGUAGES) {
			expect(seen.has(l.id)).toBe(false);
			seen.add(l.id);
			expect(l.displayName.length).toBeGreaterThan(0);
		}
	});

	it("aliases array always includes the canonical id", () => {
		for (const l of LANGUAGES) {
			expect(l.aliases).toContain(l.id);
		}
	});

	it("text language declares the special runtime", () => {
		const text = LANGUAGES.find((l) => l.id === "text") as LanguageDef;
		expect(text.runtime).toBe("text");
	});

	it("spawn-runtime languages have a run command", () => {
		for (const l of LANGUAGES) {
			if (l.runtime === undefined) {
				expect(l.run).toBeDefined();
			}
		}
	});

	it("text language omits run/compile (handled in-memory)", () => {
		const text = LANGUAGES.find((l) => l.id === "text") as LanguageDef;
		expect(text.run).toBeUndefined();
		expect(text.compile).toBeUndefined();
	});

	it("csharp uses `dotnet run` for single-file execution (no compile step)", () => {
		const csharp = LANGUAGES.find((l) => l.id === "csharp") as LanguageDef;
		expect(csharp.runtime).toBeUndefined();
		expect(csharp.compile).toBeUndefined();
		const run = "command" in csharp.run! ? csharp.run : csharp.run!.linux!;
		expect(run.command).toBe("dotnet");
		expect(run.args[0]).toBe("run");
	});

	it("rust compile args include --edition=2024", () => {
		const rust = LANGUAGES.find((l) => l.id === "rust") as LanguageDef;
		const args = "command" in rust.compile! ? rust.compile.args : rust.compile!.linux!.args;
		expect(args).toContain("--edition=2024");
	});

	it("java run command does not include -XX:+UseSerialGC", () => {
		const java = LANGUAGES.find((l) => l.id === "java") as LanguageDef;
		const args = "command" in java.run! ? java.run!.args : java.run!.linux!.args;
		expect(args).not.toContain("-XX:+UseSerialGC");
	});

	it("python uses 'python3' on linux/darwin and 'python' on win32", () => {
		const py = LANGUAGES.find((l) => l.id === "python") as LanguageDef;
		expect("linux" in py.run!).toBe(true);
		const platCmd = py.run! as Record<string, { command: string; args: string[] }>;
		expect(platCmd.linux.command).toBe("python3");
		expect(platCmd.win32.command).toBe("python");
	});
});
