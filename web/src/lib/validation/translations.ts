import { z } from "zod";

export const languageCodeSchema = z.enum(["ko", "en", "ja", "pl", "hr"]);

export const translationSchema = z.object({
	title: z.string().min(1),
	content: z.string().min(1),
	translatorId: z.number().int().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// Zod v4의 z.record(enum, value)는 enum의 모든 키를 필수로 요구하므로,
// 문자열 키 record로 받고 별도 refine에서 언어 코드 화이트리스트를 검증한다.
const ALLOWED_LANGUAGES = languageCodeSchema.options;

export const translationsSchema = z
	.object({
		original: languageCodeSchema,
		entries: z.record(z.string(), translationSchema),
	})
	.refine((t) => Object.keys(t.entries).every((k) => ALLOWED_LANGUAGES.includes(k as never)), {
		message: `entries keys must be one of: ${ALLOWED_LANGUAGES.join(", ")}`,
		path: ["entries"],
	})
	.refine((t) => t.original in t.entries, {
		message: "original language must exist in entries",
		path: ["original"],
	})
	.refine((t) => Object.keys(t.entries).length >= 1, {
		message: "at least one translation required",
		path: ["entries"],
	});

export const translationInputSchema = z.object({
	title: z.string().min(1),
	content: z.string().min(1),
	translatorId: z.number().int().nullable().optional(),
});

export type TranslationInput = z.infer<typeof translationInputSchema>;
