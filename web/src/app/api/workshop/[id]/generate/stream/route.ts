import { NextResponse } from "next/server";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { type GenerateJobProgress, getRun, subscribeRun } from "@/lib/workshop/generate-runs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	let userId: number;
	try {
		const access = await requireWorkshopAccess();
		userId = access.userId;
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "unauthorized" },
			{ status: 401 }
		);
	}

	const { id } = await params;
	if (!/^\d+$/.test(id)) {
		return NextResponse.json({ error: "invalid problem id" }, { status: 400 });
	}
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId) || problemId <= 0) {
		return NextResponse.json({ error: "invalid problem id" }, { status: 400 });
	}

	const url = new URL(request.url);
	const runId = url.searchParams.get("runId");
	if (!runId) {
		return NextResponse.json({ error: "missing runId" }, { status: 400 });
	}
	const run = getRun(runId);
	if (!run || run.problemId !== problemId || run.userId !== userId) {
		return NextResponse.json({ error: "run not found" }, { status: 404 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const write = (event: string, data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					/* controller closed */
				}
			};

			// Subscribe BEFORE emitting the snapshot — otherwise the run can
			// finish between the snapshot read and the subscribe call, and the
			// terminal complete event is lost (SSE hangs forever).
			let closed = false;
			const onEvent = (evt: GenerateJobProgress) => {
				if (closed) return;
				write("progress", evt);
				if (run.done) {
					write("complete", { runId });
					closed = true;
					unsubscribe();
					clearInterval(heartbeat);
					try {
						controller.close();
					} catch {
						/* ignore */
					}
				}
			};
			const unsubscribe = subscribeRun(runId, onEvent);

			// Initial snapshot: send all currently-known progress rows.
			write("snapshot", {
				runId,
				generatedCount: run.generatedCount,
				manualCount: run.manualCount,
				progress: [...run.progress.values()],
				done: run.done,
			});

			// Re-check: if the run completed between subscribe and now (or was
			// already done at snapshot time), emit complete and close. Without
			// this, callers waiting on terminal would hang.
			if (run.done) {
				if (!closed) {
					write("complete", { runId });
					closed = true;
					unsubscribe();
				}
				setTimeout(() => {
					try {
						controller.close();
					} catch {
						/* ignore */
					}
				}, 50);
				return;
			}

			// Heartbeat every 25s to keep proxies happy.
			const heartbeat = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(": keepalive\n\n"));
				} catch {
					closed = true;
					clearInterval(heartbeat);
					unsubscribe();
				}
			}, 25_000);

			request.signal.addEventListener("abort", () => {
				closed = true;
				clearInterval(heartbeat);
				unsubscribe();
				try {
					controller.close();
				} catch {
					/* ignore */
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
