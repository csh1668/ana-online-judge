import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { registerSSEClient, sendHeartbeat } from "@/lib/sse-manager";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const submissionId = parseInt(id, 10);

	if (Number.isNaN(submissionId)) {
		return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
	}

	// Check if submission exists
	const [submission] = await db
		.select({ id: submissions.id, verdict: submissions.verdict })
		.from(submissions)
		.where(eq(submissions.id, submissionId))
		.limit(1);

	if (!submission) {
		return NextResponse.json({ error: "Submission not found" }, { status: 404 });
	}

	const isAlreadyComplete = submission.verdict !== "pending" && submission.verdict !== "judging";

	// Create SSE stream
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// If already completed, send complete event immediately and close
			if (isAlreadyComplete) {
				const completeMessage = `event: complete\ndata: ${JSON.stringify({ submissionId })}\n\n`;
				controller.enqueue(encoder.encode(completeMessage));
				setTimeout(() => {
					try {
						controller.close();
					} catch (_error) {
						// Controller might already be closed
					}
				}, 100);
				return;
			}

			// Register this client
			const unregister = registerSSEClient(submissionId, controller);

			// Send initial connection message
			const connectMessage = `event: connected\ndata: ${JSON.stringify({ submissionId })}\n\n`;
			controller.enqueue(encoder.encode(connectMessage));

			// Heartbeat interval (every 30 seconds)
			const heartbeatInterval = setInterval(() => {
				try {
					sendHeartbeat({ controller, encoder });
				} catch (error) {
					console.error("Heartbeat failed:", error);
					clearInterval(heartbeatInterval);
					unregister();
				}
			}, 30000);

			// Cleanup on close
			const cleanup = () => {
				clearInterval(heartbeatInterval);
				unregister();
			};

			// Handle client disconnect
			_request.signal.addEventListener("abort", () => {
				cleanup();
				try {
					controller.close();
				} catch (_error) {
					// Controller might already be closed
				}
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no", // Disable nginx buffering
		},
	});
}
