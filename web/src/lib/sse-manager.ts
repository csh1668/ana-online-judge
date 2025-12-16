import "server-only";

type SSEClient = {
	controller: ReadableStreamDefaultController;
	encoder: TextEncoder;
};

// Use global to persist across Hot Module Reload
declare global {
	var sseClientsMap: Map<number, Set<SSEClient>> | undefined;
}

// Initialize global map if not exists
if (!global.sseClientsMap) {
	global.sseClientsMap = new Map<number, Set<SSEClient>>();
}

// Always use the global reference
function getClientsMap(): Map<number, Set<SSEClient>> {
	if (!global.sseClientsMap) {
		global.sseClientsMap = new Map<number, Set<SSEClient>>();
	}
	return global.sseClientsMap;
}

/**
 * Register a new SSE client for a submission
 */
export function registerSSEClient(
	submissionId: number,
	controller: ReadableStreamDefaultController
): () => void {
	const client: SSEClient = {
		controller,
		encoder: new TextEncoder(),
	};

	const sseClients = getClientsMap();

	if (!sseClients.has(submissionId)) {
		sseClients.set(submissionId, new Set());
	}

	sseClients.get(submissionId)!.add(client);

	// Return cleanup function
	return () => {
		const sseClients = getClientsMap();
		const clients = sseClients.get(submissionId);
		if (clients) {
			clients.delete(client);
			if (clients.size === 0) {
				sseClients.delete(submissionId);
			}
		}
	};
}

/**
 * Send an event to a specific SSE client
 */
function sendEvent(client: SSEClient, event: string, data: string) {
	try {
		const message = `event: ${event}\ndata: ${data}\n\n`;
		client.controller.enqueue(client.encoder.encode(message));
	} catch (error) {
		console.error("Error sending SSE event:", error);
	}
}

/**
 * Send heartbeat to a specific client
 */
export function sendHeartbeat(client: SSEClient) {
	try {
		const message = ": heartbeat\n\n";
		client.controller.enqueue(client.encoder.encode(message));
	} catch (error) {
		console.error("Error sending heartbeat:", error);
	}
}

/**
 * Notify all clients watching a submission about progress
 */
export function notifySubmissionProgress(submissionId: number, percentage: number) {
	const sseClients = getClientsMap();
	const clients = sseClients.get(submissionId);

	if (!clients || clients.size === 0) {
		return;
	}

	const clientsArray = Array.from(clients);
	
	for (const client of clientsArray) {
		try {
			sendEvent(client, "progress", JSON.stringify({ percentage }));
		} catch (error) {
			console.error("Error sending progress to SSE client:", error);
			clients.delete(client);
		}
	}
}

/**
 * Notify all clients watching a submission that it has been updated and close connections
 */
export async function notifySubmissionUpdate(submissionId: number) {
	const sseClients = getClientsMap();
	const clients = sseClients.get(submissionId);

	if (!clients || clients.size === 0) {
		return;
	}

	// Send complete event to all connected clients and close their connections
	const clientsArray = Array.from(clients);
	const closePromises: Promise<void>[] = [];
	
	for (const client of clientsArray) {
		try {
			sendEvent(client, "complete", JSON.stringify({ submissionId }));
			// Give client time to process the event before closing
			const closePromise = new Promise<void>((resolve) => {
				setTimeout(() => {
					try {
						client.controller.close();
					} catch (error) {
						// Controller might already be closed
					}
					resolve();
				}, 100);
			});
			closePromises.push(closePromise);
		} catch (error) {
			console.error("Error notifying SSE client:", error);
		}
	}

	// Wait for all connections to close
	await Promise.all(closePromises);

	// Clear the clients for this submission
	sseClients.delete(submissionId);
}

/**
 * Get the number of active SSE connections for a submission
 */
export function getActiveConnections(submissionId: number): number {
	const sseClients = getClientsMap();
	return sseClients.get(submissionId)?.size ?? 0;
}

/**
 * Get total number of active SSE connections across all submissions
 */
export function getTotalActiveConnections(): number {
	const sseClients = getClientsMap();
	let total = 0;
	for (const clients of sseClients.values()) {
		total += clients.size;
	}
	return total;
}

