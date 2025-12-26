import "server-only";

import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { db } from "@/db";
import { submissionResults, submissions, type Verdict } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { notifySubmissionUpdate } from "./sse-manager";

interface JudgeResult {
	submission_id: number;
	verdict: string;
	execution_time: number | null;
	memory_used: number | null;
	error_message?: string | null;
	score?: number;
	edit_distance?: number | null;
	testcase_results: {
		testcase_id: number;
		verdict: string;
		execution_time: number | null;
		memory_used: number | null;
	}[];
}

const RESULT_KEY_PREFIX = "judge:result:";
const ANIGMA_RESULT_KEY_PREFIX = "anigma:result:";
const JUDGE_RESULT_CHANNEL = "judge:results";
const ANIGMA_RESULT_CHANNEL = "anigma:results";
const JUDGE_PROGRESS_CHANNEL = "judge:progress";

class RedisSubscriber {
	private subscriber: Redis | null = null;
	private deleter: Redis | null = null;
	private isConnected = false;

	async start() {
		if (this.isConnected) {
			console.log("Redis subscriber already running");
			return;
		}

		try {
			// Subscriber connection
			this.subscriber = new Redis(serverEnv.REDIS_URL, {
				maxRetriesPerRequest: null,
				lazyConnect: true,
			});

			// Separate connection for DELETE operations (can't use subscriber for commands)
			this.deleter = new Redis(serverEnv.REDIS_URL, {
				maxRetriesPerRequest: null,
				lazyConnect: true,
			});

			await this.subscriber.connect();
			await this.deleter.connect();

			// Subscribe to channels
			await this.subscriber.subscribe(
				JUDGE_RESULT_CHANNEL,
				ANIGMA_RESULT_CHANNEL,
				JUDGE_PROGRESS_CHANNEL
			);

			// Handle messages
			this.subscriber.on("message", async (channel, message) => {
				try {
					if (channel === JUDGE_PROGRESS_CHANNEL) {
						await this.handleProgressMessage(message);
					} else {
						await this.handleMessage(channel, message);
					}
				} catch (error) {
					console.error(`Error handling message from ${channel}:`, error);
				}
			});

			// Handle reconnection
			this.subscriber.on("error", (error) => {
				console.error("Redis subscriber error:", error);
			});

			this.subscriber.on("close", () => {
				console.warn("Redis subscriber connection closed. Will attempt to reconnect...");
				this.isConnected = false;
			});

			this.subscriber.on("ready", () => {
				console.log("Redis subscriber ready");
				this.isConnected = true;
			});

			console.log("Redis subscriber started, listening for judge results...");
		} catch (error) {
			console.error("Failed to start Redis subscriber:", error);
			throw error;
		}
	}

	private async handleProgressMessage(message: string) {
		try {
			const progress = JSON.parse(message);
			const submissionId = progress.submission_id;
			const percentage = progress.percentage;

			console.log(`Progress for submission ${submissionId}: ${percentage}%`);

			// Notify SSE clients about progress
			const { notifySubmissionProgress } = await import("./sse-manager");
			notifySubmissionProgress(submissionId, percentage);
		} catch (error) {
			console.error("Error processing progress message:", error);
		}
	}

	private async handleMessage(channel: string, message: string) {
		try {
			const result: JudgeResult = JSON.parse(message);
			const submissionId = result.submission_id;

			console.log(`Received ${channel} result for submission ${submissionId}: ${result.verdict}`);

			// Update database
			await db
				.update(submissions)
				.set({
					verdict: result.verdict as Verdict,
					executionTime: result.execution_time,
					memoryUsed: result.memory_used,
					errorMessage: result.error_message ?? null,
					score: result.score ?? null,
					editDistance: result.edit_distance ?? null,
				})
				.where(eq(submissions.id, submissionId));

			// Insert testcase results
			if (result.testcase_results && result.testcase_results.length > 0) {
				// Delete existing results first
				await db.delete(submissionResults).where(eq(submissionResults.submissionId, submissionId));

				await db.insert(submissionResults).values(
					result.testcase_results.map((tc) => ({
						submissionId,
						testcaseId: tc.testcase_id,
						verdict: tc.verdict as Verdict,
						executionTime: tc.execution_time,
						memoryUsed: tc.memory_used,
					}))
				);
			}

			// Delete result from Redis
			if (this.deleter) {
				const resultKey =
					channel === ANIGMA_RESULT_CHANNEL
						? `${ANIGMA_RESULT_KEY_PREFIX}${submissionId}`
						: `${RESULT_KEY_PREFIX}${submissionId}`;
				await this.deleter.del(resultKey);
			}

			// Notify SSE clients
			await notifySubmissionUpdate(submissionId);

			// If this is a contest ANIGMA submission that was accepted, trigger bonus recalculation
			if (
				channel === ANIGMA_RESULT_CHANNEL &&
				result.verdict === "accepted" &&
				result.edit_distance !== null
			) {
				// Get submission details to check if it's a contest submission
				const [submission] = await db
					.select({
						contestId: submissions.contestId,
						problemId: submissions.problemId,
					})
					.from(submissions)
					.where(eq(submissions.id, submissionId))
					.limit(1);

				if (submission?.contestId) {
					// Trigger bonus recalculation in background
					const { recalculateContestBonus } = await import("./anigma-bonus");
					recalculateContestBonus(submission.contestId, submission.problemId).catch((error) => {
						console.error("Error recalculating contest bonus:", error);
					});
				}
			}
		} catch (error) {
			console.error("Error processing judge result:", error);
			throw error;
		}
	}

	async stop() {
		if (this.subscriber) {
			await this.subscriber.unsubscribe(
				JUDGE_RESULT_CHANNEL,
				ANIGMA_RESULT_CHANNEL,
				JUDGE_PROGRESS_CHANNEL
			);
			await this.subscriber.quit();
			this.subscriber = null;
		}

		if (this.deleter) {
			await this.deleter.quit();
			this.deleter = null;
		}

		this.isConnected = false;
		console.log("Redis subscriber stopped");
	}
}

// Singleton instance
let subscriberInstance: RedisSubscriber | null = null;

export async function startRedisSubscriber() {
	if (!subscriberInstance) {
		subscriberInstance = new RedisSubscriber();
	}
	await subscriberInstance.start();
}

export async function stopRedisSubscriber() {
	if (subscriberInstance) {
		await subscriberInstance.stop();
		subscriberInstance = null;
	}
}
