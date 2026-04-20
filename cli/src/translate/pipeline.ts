import pLimit from "p-limit";
import chalk from "chalk";
import type { Failure, TranslateOutput } from "./types.js";

export interface PipelineOptions {
	concurrency: number;
	totalCount: number;
}

export interface PipelineResult {
	successCount: number;
	skipCount: number;
	failures: Failure[];
}

type ProcessOutcome =
	| { status: "ok"; output: TranslateOutput; tookMs: number }
	| { status: "skip"; reason: string }
	| { status: "fail"; reason: string };

export type ProcessFn = (problemId: number) => Promise<ProcessOutcome>;

/**
 * 주어진 ids 배열에 대해 process 함수를 동시 실행.
 * 진행률은 stderr로, 결과는 PipelineResult로 반환.
 */
export async function runPipeline(
	ids: number[],
	process: ProcessFn,
	opts: PipelineOptions
): Promise<PipelineResult> {
	const limit = pLimit(opts.concurrency);
	let successCount = 0;
	let skipCount = 0;
	const failures: Failure[] = [];
	let done = 0;

	await Promise.all(
		ids.map((id) =>
			limit(async () => {
				const outcome = await process(id).catch(
					(err): ProcessOutcome => ({
						status: "fail",
						reason: err instanceof Error ? err.message : String(err),
					})
				);
				done++;
				const prefix = chalk.dim(`[${done}/${opts.totalCount}]`);
				switch (outcome.status) {
					case "ok":
						successCount++;
						console.error(
							`${prefix} problem ${id} ${chalk.green("✓")} (${outcome.tookMs}ms)`
						);
						break;
					case "skip":
						skipCount++;
						console.error(`${prefix} problem ${id} ${chalk.yellow("skip")}: ${outcome.reason}`);
						break;
					case "fail":
						failures.push({ problemId: id, reason: outcome.reason });
						console.error(`${prefix} problem ${id} ${chalk.red("✗")} ${outcome.reason}`);
						break;
				}
			})
		)
	);

	return { successCount, skipCount, failures };
}

export function printSummary(result: PipelineResult): void {
	console.error("");
	console.error(chalk.bold("=== Summary ==="));
	console.error(`  ${chalk.green("Success")}: ${result.successCount}`);
	console.error(`  ${chalk.yellow("Skipped")}: ${result.skipCount}`);
	console.error(`  ${chalk.red("Failed")}:  ${result.failures.length}`);
	if (result.failures.length > 0) {
		console.error(chalk.red("\nFailures:"));
		for (const f of result.failures) {
			console.error(`  - problem ${f.problemId}: ${f.reason}`);
		}
	}
}
