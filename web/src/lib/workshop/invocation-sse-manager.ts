import "server-only";

type SSEClient = {
	controller: ReadableStreamDefaultController;
	encoder: TextEncoder;
};

declare global {
	var workshopInvocationSSEClients: Map<string, Set<SSEClient>> | undefined;
}

if (!global.workshopInvocationSSEClients) {
	global.workshopInvocationSSEClients = new Map<string, Set<SSEClient>>();
}

function getClientsMap(): Map<string, Set<SSEClient>> {
	if (!global.workshopInvocationSSEClients) {
		global.workshopInvocationSSEClients = new Map<string, Set<SSEClient>>();
	}
	return global.workshopInvocationSSEClients;
}

export function registerInvocationSSEClient(
	invocationId: string,
	controller: ReadableStreamDefaultController
): () => void {
	const client: SSEClient = { controller, encoder: new TextEncoder() };
	const map = getClientsMap();
	if (!map.has(invocationId)) map.set(invocationId, new Set());
	map.get(invocationId)!.add(client);
	return () => {
		const clients = map.get(invocationId);
		if (clients) {
			clients.delete(client);
			if (clients.size === 0) map.delete(invocationId);
		}
	};
}

function sendEvent(client: SSEClient, event: string, data: string) {
	try {
		const message = `event: ${event}\ndata: ${data}\n\n`;
		client.controller.enqueue(client.encoder.encode(message));
	} catch (error) {
		console.error("Error sending invocation SSE event:", error);
	}
}

export function sendInvocationHeartbeat(client: SSEClient) {
	try {
		client.controller.enqueue(client.encoder.encode(": heartbeat\n\n"));
	} catch (error) {
		console.error("Error sending heartbeat:", error);
	}
}

/**
 * Fan-out one cell result to all currently-subscribed clients.
 * Does NOT close the stream — invocations may still have pending cells.
 */
export function notifyInvocationResult(invocationId: string, payload: unknown) {
	const clients = getClientsMap().get(invocationId);
	if (!clients || clients.size === 0) return;
	const data = JSON.stringify(payload);
	for (const client of Array.from(clients)) {
		try {
			sendEvent(client, "result", data);
		} catch (error) {
			console.error("Error fanning invocation result:", error);
			clients.delete(client);
		}
	}
}

/**
 * Signal all subscribers that the invocation is finished (completed or failed)
 * and close their streams. After this call no more `result` events will fire.
 */
export async function notifyInvocationDone(invocationId: string, status: "completed" | "failed") {
	const map = getClientsMap();
	const clients = map.get(invocationId);
	if (!clients || clients.size === 0) return;
	const data = JSON.stringify({ invocationId, status });
	const closePromises: Promise<void>[] = [];
	for (const client of Array.from(clients)) {
		try {
			sendEvent(client, "done", data);
			closePromises.push(
				new Promise<void>((resolve) => {
					setTimeout(() => {
						try {
							client.controller.close();
						} catch {
							// already closed
						}
						resolve();
					}, 100);
				})
			);
		} catch (error) {
			console.error("Error notifying invocation done:", error);
		}
	}
	await Promise.all(closePromises);
	map.delete(invocationId);
}

export function getActiveInvocationConnections(invocationId: string): number {
	return getClientsMap().get(invocationId)?.size ?? 0;
}
