export async function register() {
	// Only run on Node.js runtime (server-side)
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startRedisSubscriber } = await import("@/lib/redis-subscriber");

		console.log("Starting Redis subscriber service...");
		await startRedisSubscriber();
		console.log("Redis subscriber service started successfully");

		const { startJudgeReconciler, stopJudgeReconciler } = await import("@/lib/judge-reconciler");
		startJudgeReconciler();

		const { ensureLanguageInstallSubscriberStarted } = await import(
			"@/lib/languages/install-pubsub"
		);
		await ensureLanguageInstallSubscriberStarted();
		const { publishLanguageSnapshot } = await import("@/lib/services/languages");
		publishLanguageSnapshot().catch((e) =>
			console.error("[instrumentation] language snapshot failed:", e)
		);

		// 레거시 인터랙티브 문제(special_judge + aoj_checker.Interactive) → interactive 자동 이관.
		// 배포가 자동(runner → make prod-up)이라 수동 스크립트 단계 대신 기동 시 멱등 실행한다.
		// Redis 락으로 단일 인스턴스 보장, 실패해도 기동은 계속(judge 런타임 폴백 존재).
		const { runLegacyInteractiveMigrationOnce } = await import(
			"@/lib/services/interactive-problem-migration"
		);
		runLegacyInteractiveMigrationOnce().catch((e) =>
			console.error("[instrumentation] interactive migration failed:", e)
		);

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
