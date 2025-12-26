export async function register() {
	// Only run on Node.js runtime (server-side)
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startRedisSubscriber } = await import("@/lib/redis-subscriber");

		console.log("Starting Redis subscriber service...");
		await startRedisSubscriber();
		console.log("Redis subscriber service started successfully");

		// Handle graceful shutdown
		const shutdown = async () => {
			console.log("Shutting down Redis subscriber...");
			const { stopRedisSubscriber } = await import("@/lib/redis-subscriber");
			await stopRedisSubscriber();
			console.log("Redis subscriber stopped");
			process.exit(0);
		};

		process.on("SIGTERM", shutdown);
		process.on("SIGINT", shutdown);
	}
}
