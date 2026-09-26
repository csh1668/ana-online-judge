import { auth } from "@/auth";
import {
	ensureLanguageInstallSubscriberStarted,
	subscribeInstallLog,
} from "@/lib/languages/install-pubsub";
import { getInstallLog, getLanguage, LANGUAGE_ID_RE } from "@/lib/services/languages";

export const dynamic = "force-dynamic";

const POLL_MS = 2000;
const HEARTBEAT_MS = 30000;

/** 구독 시작과 LRANGE 사이에 들어온 줄은 양쪽에 모두 있을 수 있다 — 겹치는 접두부를 제거한다. */
function dropOverlap(history: string[], buffered: string[]): string[] {
	const max = Math.min(history.length, buffered.length);
	for (let k = max; k > 0; k--) {
		let same = true;
		for (let i = 0; i < k; i++) {
			if (history[history.length - k + i] !== buffered[i]) {
				same = false;
				break;
			}
		}
		if (same) return buffered.slice(k);
	}
	return buffered;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (session?.user?.role !== "admin") {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}
	const { id } = await params;
	if (!LANGUAGE_ID_RE.test(id)) {
		return new Response(JSON.stringify({ error: "Invalid language id" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
	await ensureLanguageInstallSubscriberStarted();

	let cleanup: (() => void) | null = null;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const enqueue = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// Controller already closed
				}
			};
			const send = (event: string, data: unknown) =>
				enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

			// 히스토리를 보내기 전까지 라이브 줄은 버퍼에 모은다.
			let buffer: string[] | null = [];
			const unsubscribe = subscribeInstallLog(id, (line) => {
				if (buffer) buffer.push(line);
				else send("log", { line });
			});

			let poll: ReturnType<typeof setInterval> | undefined;
			let heartbeat: ReturnType<typeof setInterval> | undefined;
			const close = () => {
				if (closed) return;
				closed = true;
				clearInterval(poll);
				clearInterval(heartbeat);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// already closed
				}
			};
			cleanup = close;
			request.signal.addEventListener("abort", close);
			if (request.signal.aborted) {
				close();
				return;
			}

			const checkState = async () => {
				try {
					const row = await getLanguage(id);
					if (closed) return;
					if (!row) {
						send("done", {});
						close();
						return;
					}
					send("state", { state: row.installState, installedHash: row.installedHash });
					if (row.installState !== "installing") {
						send("done", {});
						close();
					}
				} catch (err) {
					console.error("[install-log] state poll failed:", err);
				}
			};

			try {
				const history = await getInstallLog(id);
				for (const line of history) send("log", { line });
				for (const line of dropOverlap(history, buffer)) send("log", { line });
			} catch (err) {
				console.error("[install-log] failed to read install log:", err);
			}
			buffer = null;
			// 히스토리를 읽는 동안 연결이 끊겼다면 close()가 이미 실행됐으므로 타이머를 만들지 않는다.
			if (closed) return;

			heartbeat = setInterval(() => enqueue(": heartbeat\n\n"), HEARTBEAT_MS);
			poll = setInterval(checkState, POLL_MS);
			await checkState();
		},
		cancel() {
			cleanup?.();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
