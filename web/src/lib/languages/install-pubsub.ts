import "server-only";

import { Redis } from "ioredis";
import { serverEnv } from "@/lib/env";
import { applyInstallResult, type LanguageInstallResultWire } from "@/lib/services/languages";

const RESULT_PATTERN = "judge:install:*:result";
const LOG_PATTERN = "judge:install:*:log";

type LineListener = (line: string) => void;
const logListeners = new Map<string, Set<LineListener>>();

let subscriber: Redis | null = null;
let starting: Promise<void> | null = null;

export async function ensureLanguageInstallSubscriberStarted(): Promise<void> {
	if (subscriber) return;
	if (starting) return starting;
	starting = (async () => {
		const client = new Redis(serverEnv.REDIS_URL, {
			maxRetriesPerRequest: null,
			lazyConnect: true,
		});
		await client.connect();
		await client.psubscribe(RESULT_PATTERN, LOG_PATTERN);
		client.on("pmessage", async (_pattern, channel, message) => {
			const m = /^judge:install:(.+):(result|log)$/.exec(channel);
			if (!m) return;
			const [, id, kind] = m;
			if (kind === "log") {
				for (const l of logListeners.get(id) ?? []) l(message);
				return;
			}
			try {
				await applyInstallResult(JSON.parse(message) as LanguageInstallResultWire);
			} catch (err) {
				console.error("[language-install-pubsub] failed to apply result:", err);
			}
		});
		client.on("error", (err) => {
			console.error("[language-install-pubsub] subscriber error:", err);
		});
		subscriber = client;
	})();
	try {
		await starting;
	} finally {
		starting = null;
	}
}

export function subscribeInstallLog(id: string, onLine: LineListener): () => void {
	let set = logListeners.get(id);
	if (!set) {
		set = new Set();
		logListeners.set(id, set);
	}
	set.add(onLine);
	return () => {
		set?.delete(onLine);
		if (set && set.size === 0) logListeners.delete(id);
	};
}
