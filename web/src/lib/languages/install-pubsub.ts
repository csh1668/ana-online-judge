import "server-only";

import { Redis } from "ioredis";
import { serverEnv } from "@/lib/env";
import { applyInstallResult, type LanguageInstallResultWire } from "@/lib/services/languages";

const RESULT_PATTERN = "judge:install:*:result";
const LOG_PATTERN = "judge:install:*:log";

type LineListener = (line: string) => void;

// instrumentation과 앱 레이어(SSE route)는 서로 다른 모듈 인스턴스를 가질 수 있으므로
// 구독자와 리스너 맵을 globalThis에 둔다 (sse-manager.ts와 같은 패턴).
declare global {
	var languageInstallSubscriber: Redis | null | undefined;
	var languageInstallSubscriberStarting: Promise<void> | null | undefined;
	var languageInstallLogListeners: Map<string, Set<LineListener>> | undefined;
}

function getLogListeners(): Map<string, Set<LineListener>> {
	if (!global.languageInstallLogListeners) {
		global.languageInstallLogListeners = new Map<string, Set<LineListener>>();
	}
	return global.languageInstallLogListeners;
}

export async function ensureLanguageInstallSubscriberStarted(): Promise<void> {
	if (global.languageInstallSubscriber) return;
	if (global.languageInstallSubscriberStarting) return global.languageInstallSubscriberStarting;
	const starting = (async () => {
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
				for (const l of getLogListeners().get(id) ?? []) {
					try {
						l(message);
					} catch (err) {
						console.error("[language-install-pubsub] log listener failed:", err);
					}
				}
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
		global.languageInstallSubscriber = client;
	})();
	global.languageInstallSubscriberStarting = starting;
	try {
		await starting;
	} finally {
		global.languageInstallSubscriberStarting = null;
	}
}

export function subscribeInstallLog(id: string, onLine: LineListener): () => void {
	const listeners = getLogListeners();
	let set = listeners.get(id);
	if (!set) {
		set = new Set();
		listeners.set(id, set);
	}
	set.add(onLine);
	return () => {
		set?.delete(onLine);
		if (set && set.size === 0 && listeners.get(id) === set) listeners.delete(id);
	};
}
