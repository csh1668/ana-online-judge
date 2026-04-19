import { z } from "zod";

export const languageCodeSchema = z.enum(["ko", "en", "ja", "pl", "hr"]);

export const translationSchema = z.object({
	title: z.string().min(1),
	content: z.string().min(1),
	translatorId: z.number().int().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const translationsSchema = z
	.object({
		original: languageCodeSchema,
		entries: z.record(languageCodeSchema, translationSchema),
	})
	.refine((t) => t.original in t.entries, {
		message: "original language must exist in entries",
	})
	.refine((t) => Object.keys(t.entries).length >= 1, {
		message: "at least one translation required",
	});

export const translationInputSchema = z.object({
	title: z.string().min(1),
	content: z.string().min(1),
	translatorId: z.number().int().nullable().optional(),
});

export type TranslationInput = z.infer<typeof translationInputSchema>;
