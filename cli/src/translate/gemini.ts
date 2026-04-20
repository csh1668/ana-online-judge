import { GoogleGenAI, Type } from "@google/genai";
import type { TranslateInput, TranslateOutput } from "./types.js";
import { buildUserMessage, loadSystemPrompt } from "./prompt.js";

const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

export interface GeminiOptions {
	apiKey: string;
	model?: string;
	promptPath?: string;
	timeoutMs?: number;
}

const responseSchema = {
	type: Type.OBJECT,
	properties: {
		title: { type: Type.STRING, description: "한국어 번역된 제목 (한 줄)" },
		content: { type: Type.STRING, description: "한국어 번역된 본문 (마크다운)" },
	},
	required: ["title", "content"],
	propertyOrdering: ["title", "content"],
};

export class GeminiTranslator {
	private client: GoogleGenAI;
	private model: string;
	private systemPrompt: string;
	private timeoutMs: number;

	constructor(opts: GeminiOptions) {
		this.client = new GoogleGenAI({ apiKey: opts.apiKey });
		this.model = opts.model ?? DEFAULT_MODEL;
		this.systemPrompt = loadSystemPrompt(opts.promptPath);
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async translate(input: TranslateInput): Promise<TranslateOutput> {
		const userMessage = buildUserMessage(input);

		let lastErr: unknown;
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const response = await this.callWithTimeout(userMessage);
				const text = response.text;
				if (!text) throw new Error("Empty response from Gemini");
				return this.parseResponse(text);
			} catch (err) {
				lastErr = err;
				if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break;
				const backoff = 500 * 2 ** attempt + Math.floor(Math.random() * 200);
				await new Promise((r) => setTimeout(r, backoff));
			}
		}
		throw new Error(
			`Gemini translation failed after ${MAX_RETRIES} attempts: ${describe(lastErr)}`,
		);
	}

	private async callWithTimeout(userMessage: string) {
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), this.timeoutMs);
		try {
			return await this.client.models.generateContent({
				model: this.model,
				contents: userMessage,
				config: {
					systemInstruction: this.systemPrompt,
					responseMimeType: "application/json",
					responseSchema,
					abortSignal: ac.signal,
				},
			});
		} finally {
			clearTimeout(timer);
		}
	}

	private parseResponse(text: string): TranslateOutput {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (err) {
			throw new Error(
				`Gemini response is not valid JSON: ${describe(err)}\n  raw: ${text.slice(0, 200)}`,
			);
		}
		const obj = parsed as Record<string, unknown>;
		if (typeof obj.title !== "string" || typeof obj.content !== "string") {
			throw new Error(
				`Gemini response missing title/content fields: ${JSON.stringify(parsed).slice(0, 200)}`,
			);
		}
		if (obj.title.trim().length === 0 || obj.content.trim().length === 0) {
			throw new Error("Gemini returned empty title or content");
		}
		return { title: obj.title, content: obj.content };
	}
}

function isRetryable(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const msg = err.message.toLowerCase();
	if (msg.includes("aborted") || msg.includes("timeout")) return true;
	// Google SDK 에러 메시지에 status code 포함되는 경우
	if (/\b(429|500|502|503|504)\b/.test(err.message)) return true;
	if (msg.includes("not valid json")) return true; // JSON 파싱 실패도 재시도
	return false;
}

function describe(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}
