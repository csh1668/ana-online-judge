import "server-only";
import { readProblemTier, recomputeProblemTier } from "@/lib/services/problem-tier";
import { getProblemSolvers, recomputeUserRating } from "@/lib/services/user-rating";

/**
 * 레이팅/티어 재계산 in-process 큐.
 *
 * SINGLE-INSTANCE ONLY
 * 이 큐의 dedup·직렬화는 같은 Node.js 프로세스 내에서만 보장된다.
 */
export type RatingJob =
	| { kind: "recomputeProblemTier"; problemId: number }
	| { kind: "recomputeUserRating"; userId: number };

// Next.js HMR로 모듈이 재로드되더라도 큐가 리셋되지 않도록 global에 저장.
type QueueState = {
	pending: Map<string, RatingJob>;
	running: boolean;
};

const GLOBAL_KEY = Symbol.for("aoj.ratingQueue");
type GlobalWithQueue = typeof globalThis & { [GLOBAL_KEY]?: QueueState };
const g = globalThis as GlobalWithQueue;
if (!g[GLOBAL_KEY]) {
	g[GLOBAL_KEY] = { pending: new Map(), running: false };
}
const state: QueueState = g[GLOBAL_KEY];

function jobKey(job: RatingJob): string {
	return job.kind === "recomputeProblemTier"
		? `problemTier:${job.problemId}`
		: `userRating:${job.userId}`;
}

export function enqueue(job: RatingJob): void {
	state.pending.set(jobKey(job), job);
	void tick();
}

async function tick(): Promise<void> {
	if (state.running) return;
	state.running = true;
	try {
		while (state.pending.size > 0) {
			const iter = state.pending.entries().next();
			if (iter.done) break;
			const [key, job] = iter.value;
			state.pending.delete(key);
			try {
				await process(job);
			} catch (err) {
				console.error(`[rating-queue] job failed: ${key}`, err);
			}
		}
	} finally {
		state.running = false;
	}
}

async function process(job: RatingJob): Promise<void> {
	if (job.kind === "recomputeProblemTier") {
		const before = await readProblemTier(job.problemId);
		const after = await recomputeProblemTier(job.problemId);
		if (before !== after) {
			const solvers = await getProblemSolvers(job.problemId);
			for (const userId of solvers) {
				enqueue({ kind: "recomputeUserRating", userId });
			}
		}
	} else {
		await recomputeUserRating(job.userId);
	}
}
