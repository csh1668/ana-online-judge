import { NextResponse } from "next/server";
import { getInvocation } from "@/lib/services/workshop-invocations";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import {
	registerInvocationSSEClient,
	sendInvocationHeartbeat,
} from "@/lib/workshop/invocation-sse-manager";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		await requireWorkshopAccess();
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "권한이 없습니다" },
			{ status: 403 }
		);
	}

	const { id } = await params;
	if (!/^\d+$/.test(id)) {
		return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
	}
	const invocationId = Number.parseInt(id, 10);
	if (!Number.isFinite(invocationId) || invocationId <= 0) {
		return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
	}
	const invocation = await getInvocation(invocationId);
	if (!invocation) {
		return NextResponse.json({ error: "인보케이션을 찾을 수 없습니다" }, { status: 404 });
	}

	const isAlreadyFinal = invocation.status === "completed" || invocation.status === "failed";

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			if (isAlreadyFinal) {
				const message = `event: done\ndata: ${JSON.stringify({
					invocationId,
					status: invocation.status,
				})}\n\n`;
				controller.enqueue(encoder.encode(message));
				setTimeout(() => {
					try {
						controller.close();
					} catch {
						// already closed
					}
				}, 100);
				return;
			}

			const unregister = registerInvocationSSEClient(invocationId, controller);
			controller.enqueue(
				encoder.encode(`event: connected\ndata: ${JSON.stringify({ id: invocationId })}\n\n`)
			);

			const heartbeat = setInterval(() => {
				try {
					sendInvocationHeartbeat({ controller, encoder });
				} catch (err) {
					console.error("Invocation heartbeat failed:", err);
					clearInterval(heartbeat);
					unregister();
				}
			}, 30000);

			request.signal.addEventListener("abort", () => {
				clearInterval(heartbeat);
				unregister();
				try {
					controller.close();
				} catch {
					// already closed
				}
			});
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
