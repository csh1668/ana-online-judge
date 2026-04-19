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
	| { kind: "recomputeUserRating"; userId: number }
	| { kind: "recomputeProblemTags"; problemId: number };

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
	switch (job.kind) {
		case "recomputeProblemTier":
			return `problemTier:${job.problemId}`;
		case "recomputeUserRating":
			return `userRating:${job.userId}`;
		case "recomputeProblemTags":
			return `problemTags:${job.problemId}`;
	}
}

export function enqueue(job: RatingJob): void {
	state.pending.set(jobKey(job), job);
	void tick();
}

/**
 * 잡을 즉시 동기 실행하고 완료될 때까지 대기한다.
 * 서버 액션이 revalidatePath 이전에 DB 상태를 확실히 반영해야 할 때 사용.
 * 큐의 dedup/직렬화는 거치지 않지만, process() 내부 cascade(fan-out)는 그대로 enqueue 된다.
 */
export async function runNow(job: RatingJob): Promise<void> {
	await process(job);
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
	} else if (job.kind === "recomputeUserRating") {
		await recomputeUserRating(job.userId);
	} else if (job.kind === "recomputeProblemTags") {
		const { recomputeProblemTags } = await import("@/lib/services/problem-vote-tags");
		await recomputeProblemTags(job.problemId);
	}
}
