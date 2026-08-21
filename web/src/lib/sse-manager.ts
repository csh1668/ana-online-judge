import "server-only";

type SSEClient = {
	controller: ReadableStreamDefaultController;
	encoder: TextEncoder;
};

// Use global to persist across Hot Module Reload
declare global {
	var sseClientsMap: Map<number, Set<SSEClient>> | undefined;
	var sseProgressMap: Map<number, number> | undefined;
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

// 제출별 최신 진행률(%) 스냅샷. pub/sub은 흘러가면 끝이라, SSE 재접속 시
// 마지막 진행률을 즉시 보내주기 위해 서버 메모리에 보관한다.
// 항목이 있으면 워커가 채점을 시작한 것(시작 시 0% publish), 없으면 큐 대기 중.
function getProgressMap(): Map<number, number> {
	if (!global.sseProgressMap) {
		global.sseProgressMap = new Map<number, number>();
	}
	return global.sseProgressMap;
}

/**
 * Get the latest known judging progress (%) for a submission.
 * undefined = no progress seen yet (still waiting in the queue).
 */
export function getLatestProgress(submissionId: number): number | undefined {
	return getProgressMap().get(submissionId);
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
	// 보고 있는 클라이언트가 없어도 스냅샷은 갱신해야 재접속 시 바로 보여줄 수 있다.
	getProgressMap().set(submissionId, percentage);

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
	// 채점이 끝났으므로 진행률 스냅샷은 더 이상 필요 없다.
	getProgressMap().delete(submissionId);

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
					} catch (_error) {
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
