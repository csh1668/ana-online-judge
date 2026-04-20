import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface ClientConfig {
	baseUrl: string;
	apiKey: string;
	geminiKey?: string;
}

interface FetchRetryOptions {
	retries?: number; // number of retry attempts after the first (default: 3)
	backoffMs?: number; // initial backoff in ms; doubles each retry (default: 500)
	timeoutMs?: number; // per-attempt timeout; 0 disables (default: 30_000)
}

/** Retryable undici/fetch network error codes (no HTTP response received). */
const RETRYABLE_CODES = new Set([
	"UND_ERR_SOCKET",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"ECONNRESET",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
]);

function isRetryableNetworkError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	// undici fetch wraps the real reason in .cause
	const cause = (err as Error & { cause?: unknown }).cause;
	const code = (cause as { code?: string } | undefined)?.code;
	if (code && RETRYABLE_CODES.has(code)) return true;
	// Generic "fetch failed" TypeError — assume transient and allow retry
	if (err.name === "TypeError" && /fetch failed/i.test(err.message)) return true;
	if (err.name === "AbortError") return true;
	return false;
}

function describeError(err: unknown): string {
	if (!(err instanceof Error)) return String(err);
	const cause = (err as Error & { cause?: unknown }).cause;
	if (cause instanceof Error) {
		const code = (cause as { code?: string }).code;
		return code ? `${err.message} — ${cause.message} (${code})` : `${err.message} — ${cause.message}`;
	}
	return err.message;
}

async function fetchWithRetry(
	url: string,
	init: RequestInit,
	opts: FetchRetryOptions = {},
): Promise<Response> {
	const retries = opts.retries ?? 3;
	const baseBackoff = opts.backoffMs ?? 500;
	const timeoutMs = opts.timeoutMs ?? 30_000;

	let lastErr: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		const ac = timeoutMs > 0 ? new AbortController() : null;
		const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
		try {
			const res = await fetch(url, {
				...init,
				signal: ac?.signal ?? init.signal,
			});
			// Retry transient server-side failures too
			if ([502, 503, 504].includes(res.status) && attempt < retries) {
				lastErr = new Error(`HTTP ${res.status}`);
			} else {
				return res;
			}
		} catch (err) {
			lastErr = err;
			if (!isRetryableNetworkError(err) || attempt === retries) {
				// Either non-retryable or out of retries — rethrow with richer context
				throw new Error(`Request to ${url} failed: ${describeError(err)}`);
			}
		} finally {
			if (timer) clearTimeout(timer);
		}
		const delay = baseBackoff * 2 ** attempt + Math.floor(Math.random() * 200);
		await new Promise((r) => setTimeout(r, delay));
	}
	throw new Error(`Request to ${url} failed after ${retries + 1} attempts: ${describeError(lastErr)}`);
}

const CONFIG_FILE = path.join(os.homedir(), ".aojrc");

export function loadConfig(): ClientConfig | null {
	try {
		if (fs.existsSync(CONFIG_FILE)) {
			const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
			return JSON.parse(raw);
		}
	} catch {
		// ignore
	}
	return null;
}

export function saveConfig(config: ClientConfig) {
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
	fs.chmodSync(CONFIG_FILE, 0o600);
}

export function getConfig(): ClientConfig {
	const envUrl = process.env.AOJ_BASE_URL;
	const envKey = process.env.AOJ_API_KEY;

	if (envUrl && envKey) {
		return { baseUrl: envUrl, apiKey: envKey };
	}

	const config = loadConfig();
	if (!config) {
		console.error(
			"Not configured. Run: aoj config --url <base_url> --key <api_key>\n" +
				"Or set AOJ_BASE_URL and AOJ_API_KEY environment variables."
		);
		process.exit(1);
	}
	return config;
}

function formatApiError(body: unknown, status: number): string {
	const b = (body ?? {}) as { error?: unknown; details?: unknown };
	const base = typeof b.error === "string" && b.error ? b.error : `HTTP ${status}`;
	if (!b.details) return base;
	// Zod v4 issues: [{ path: [...], message: "..." }]
	if (Array.isArray(b.details)) {
		const parts: string[] = [];
		for (const issue of b.details) {
			if (issue && typeof issue === "object") {
				const i = issue as { path?: unknown; message?: unknown };
				const path = Array.isArray(i.path) ? i.path.join(".") : "";
				const msg = typeof i.message === "string" ? i.message : JSON.stringify(issue);
				parts.push(path ? `${path}: ${msg}` : msg);
			} else {
				parts.push(String(issue));
			}
		}
		return `${base}\n  ${parts.join("\n  ")}`;
	}
	return `${base}\n  ${JSON.stringify(b.details)}`;
}

export class ApiClient {
	public readonly baseUrl: string;
	private apiKey: string;

	constructor(config?: ClientConfig) {
		const c = config ?? getConfig();
		this.baseUrl = c.baseUrl.replace(/\/$/, "");
		this.apiKey = c.apiKey;
	}

	private headers(extra?: Record<string, string>): Record<string, string> {
		return {
			Authorization: `Bearer ${this.apiKey}`,
			...extra,
		};
	}

	private url(path: string): string {
		return `${this.baseUrl}/api/v1/admin${path}`;
	}

	async get<T = unknown>(path: string): Promise<T> {
		const res = await fetchWithRetry(this.url(path), { headers: this.headers() });
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(formatApiError(body, res.status));
		}
		return res.json();
	}

	async post<T = unknown>(path: string, body?: unknown): Promise<T> {
		const res = await fetchWithRetry(this.url(path), {
			method: "POST",
			headers: this.headers({ "Content-Type": "application/json" }),
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const b = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(formatApiError(b, res.status));
		}
		return res.json();
	}

	async put<T = unknown>(path: string, body?: unknown): Promise<T> {
		const res = await fetchWithRetry(this.url(path), {
			method: "PUT",
			headers: this.headers({ "Content-Type": "application/json" }),
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const b = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(formatApiError(b, res.status));
		}
		return res.json();
	}

	async delete<T = unknown>(path: string): Promise<T> {
		const res = await fetchWithRetry(this.url(path), {
			method: "DELETE",
			headers: this.headers(),
		});
		if (!res.ok) {
			const b = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(formatApiError(b, res.status));
		}
		return res.json();
	}

	async postFormData<T = unknown>(path: string, formData: FormData): Promise<T> {
		// Uploads can be slow; double the default timeout.
		const res = await fetchWithRetry(
			this.url(path),
			{ method: "POST", headers: this.headers(), body: formData },
			{ timeoutMs: 60_000 },
		);
		if (!res.ok) {
			const b = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(formatApiError(b, res.status));
		}
		return res.json();
	}

	async downloadFile(path: string): Promise<Buffer> {
		const res = await fetchWithRetry(
			this.url(path),
			{ headers: this.headers() },
			{ timeoutMs: 60_000 },
		);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const arrayBuffer = await res.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}
}

export function getGeminiKey(): string {
	const envKey = process.env.AOJ_GEMINI_KEY;
	if (envKey) return envKey;

	const config = loadConfig();
	if (!config?.geminiKey) {
		console.error(
			"Gemini API key not configured. Run: aoj config --gemini-key <key>\n" +
				"Or set AOJ_GEMINI_KEY environment variable."
		);
		process.exit(1);
	}
	return config.geminiKey;
}
