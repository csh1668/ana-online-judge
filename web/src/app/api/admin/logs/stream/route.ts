import { auth } from "@/auth";
import {
	DockerLogsError,
	isProxyConfigured,
	isWhitelistedContainer,
	streamLogs,
} from "@/lib/services/docker-logs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const session = await auth();
	if (!session?.user || session.user.role !== "admin") {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}
	if (!isProxyConfigured()) {
		return new Response(JSON.stringify({ error: "DOCKER_PROXY_URL not configured" }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { searchParams } = new URL(request.url);
	const containerName = searchParams.get("container") ?? "";
	if (!isWhitelistedContainer(containerName)) {
		return new Response(JSON.stringify({ error: "Invalid container name" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const tailParam = parseInt(searchParams.get("tail") ?? "1000", 10);
	const tail = Math.max(0, Math.min(10000, Number.isFinite(tailParam) ? tailParam : 1000));

	const upstream = new AbortController();
	request.signal.addEventListener("abort", () => upstream.abort());

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const enqueue = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// Controller already closed
				}
			};

			// Send initial connected event so client can flip its status indicator.
			enqueue(`event: connected\ndata: ${JSON.stringify({ container: containerName })}\n\n`);

			// Heartbeat: periodic comment to keep the connection alive across proxies.
			const heartbeat = setInterval(() => enqueue(": heartbeat\n\n"), 30000);

			const closeAll = () => {
				clearInterval(heartbeat);
				upstream.abort();
				try {
					controller.close();
				} catch {
					// already closed
				}
			};

			request.signal.addEventListener("abort", closeAll);

			try {
				for await (const chunk of streamLogs(
					containerName,
					{ tail, timestamps: true },
					upstream.signal
				)) {
					if (upstream.signal.aborted) break;
					const data = JSON.stringify({
						t: chunk.stream === "stderr" ? "err" : "out",
						line: chunk.line,
					});
					enqueue(`event: log\ndata: ${data}\n\n`);
				}
			} catch (error) {
				if (!upstream.signal.aborted) {
					const code = error instanceof DockerLogsError ? error.code : "INTERNAL";
					const message = error instanceof Error ? error.message : "unknown error";
					enqueue(`event: stream-error\ndata: ${JSON.stringify({ code, message })}\n\n`);
				}
			} finally {
				closeAll();
			}
		},
		cancel() {
			upstream.abort();
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
