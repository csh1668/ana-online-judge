import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface ClientConfig {
	baseUrl: string;
	apiKey: string;
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

	async get<T = unknown>(path: string): Promise<T> {
		const res = await fetch(`${this.baseUrl}/api/v1/admin${path}`, {
			headers: this.headers(),
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(formatApiError(body, res.status));
		}
		return res.json();
	}

	async post<T = unknown>(path: string, body?: unknown): Promise<T> {
		const res = await fetch(`${this.baseUrl}/api/v1/admin${path}`, {
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
		const res = await fetch(`${this.baseUrl}/api/v1/admin${path}`, {
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
		const res = await fetch(`${this.baseUrl}/api/v1/admin${path}`, {
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
		const res = await fetch(`${this.baseUrl}/api/v1/admin${path}`, {
			method: "POST",
			headers: this.headers(),
			body: formData,
		});
		if (!res.ok) {
			const b = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(formatApiError(b, res.status));
		}
		return res.json();
	}

	async downloadFile(path: string): Promise<Buffer> {
		const res = await fetch(`${this.baseUrl}/api/v1/admin${path}`, {
			headers: this.headers(),
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const arrayBuffer = await res.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}
}
