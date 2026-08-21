export async function register() {
	// Only run on Node.js runtime (server-side)
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startRedisSubscriber } = await import("@/lib/redis-subscriber");

		console.log("Starting Redis subscriber service...");
		await startRedisSubscriber();
		console.log("Redis subscriber service started successfully");

		const { startJudgeReconciler, stopJudgeReconciler } = await import("@/lib/judge-reconciler");
		startJudgeReconciler();

		// Handle graceful shutdown
		const shutdown = async () => {
			console.log("Shutting down Redis subscriber...");
			stopJudgeReconciler();
			const { stopRedisSubscriber } = await import("@/lib/redis-subscriber");
			await stopRedisSubscriber();
			console.log("Redis subscriber stopped");
			process.exit(0);
		};

		process.on("SIGTERM", shutdown);
		process.on("SIGINT", shutdown);

		// Cron only registers in production. Multi-instance safety provided by
		// Redis SET NX EX lock inside runWeeklyHandleSync (web/src/lib/redis-lock.ts).
		if (process.env.NODE_ENV === "production") {
			const cron = await import("node-cron");
			const { runWeeklyHandleSync } = await import("./lib/cron/external-handle-sync");
			cron.schedule("0 4 * * 1", runWeeklyHandleSync, { timezone: "Asia/Seoul" });
			console.info("[instrumentation] external handle sync cron registered (Mon 04:00 KST)");
		}
	}
}
