import { NextResponse } from "next/server";
import * as problemsSvc from "@/lib/services/workshop-problems";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import {
	ensureValidateSubscriberStarted,
	registerValidationSSEClient,
	sendValidationHeartbeat,
} from "@/lib/workshop/validate-pubsub";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId)) {
		return NextResponse.json({ error: "Invalid problem id" }, { status: 400 });
	}

	let userId: number;
	let isAdmin: boolean;
	try {
		const auth = await requireWorkshopAccess();
		userId = auth.userId;
		isAdmin = auth.isAdmin;
	} catch {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const problem = await problemsSvc.getWorkshopProblemForUser(problemId, userId, isAdmin);
	if (!problem) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	await ensureValidateSubscriberStarted();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const sink = { controller, encoder };

			// Initial connection event
			controller.enqueue(
				encoder.encode(`event: connected\ndata: ${JSON.stringify({ problemId })}\n\n`)
			);

			const unregister = registerValidationSSEClient(problemId, sink);

			const heartbeatInterval = setInterval(() => {
				try {
					sendValidationHeartbeat(sink);
				} catch (err) {
					console.error("[workshop-validate SSE] heartbeat failed:", err);
					clearInterval(heartbeatInterval);
					unregister();
				}
			}, 30_000);

			const cleanup = () => {
				clearInterval(heartbeatInterval);
				unregister();
			};

			request.signal.addEventListener("abort", () => {
				cleanup();
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
