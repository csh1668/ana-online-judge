/**
 * Map a workshop language enum value to its canonical source file extension.
 * Used by snapshot rollback to reconstruct draft paths for checker / validator /
 * generator / solution source files.
 *
 * The enum source of truth is `languageEnum` in `web/src/db/schema.ts` (values
 * are: "c", "cpp", "python", "java", "rust", "go", "javascript", "text").
 */
export function languageToFileExtension(language: string): string {
	switch (language) {
		case "c":
			return "c";
		case "cpp":
			return "cpp";
		case "python":
			return "py";
		case "java":
			return "java";
		case "rust":
			return "rs";
		case "go":
			return "go";
		case "javascript":
			return "js";
		case "text":
			return "txt";
		default:
			throw new Error(`알 수 없는 언어: ${language}`);
	}
}
