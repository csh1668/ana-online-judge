/**
 * 레거시 인터랙티브 문제 마이그레이션 — dry-run/수동 실행 도구.
 *
 * 실제 로직은 `@/lib/services/interactive-problem-migration`에 있고, 배포 시에는 web 기동
 * 단계에서 자동으로(멱등, Redis 락) 적용된다(`src/instrumentation.ts`). 이 스크립트는
 * 적용 전 후보를 미리 확인(dry-run)하거나 수동으로 반영할 때 쓴다.
 *
 * Run with (from `web/`):
 *   NEXT_PUBLIC_BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%S.000Z) \
 *     pnpm dlx tsx --conditions=react-server --env-file=.env \
 *     scripts/migrate-interactive-problems.ts [--apply]
 *
 * `--conditions=react-server` is required so the `server-only` marker package
 * (pulled in transitively by `@/db` and `@/lib/storage/operations`) resolves to
 * its no-op export instead of throwing outside of the Next.js build/runtime.
 * `NEXT_PUBLIC_BUILD_TIME` is normally injected by the Next.js build; the shared
 * `@/lib/env` barrel validates it eagerly even though this script never uses it.
 *
 * Default: dry-run. Pass `--apply` to persist `problem_type` changes.
 */

import {
	type MigrationOutcome,
	migrateLegacyInteractiveProblems,
} from "@/lib/services/interactive-problem-migration";

async function main() {
	const apply = process.argv.includes("--apply");
	console.log(`mode: ${apply ? "APPLY" : "DRY-RUN"}`);

	const outcomes = await migrateLegacyInteractiveProblems({ apply });
	console.log(
		`candidates (problem_type='special_judge' AND checker_path LIKE '%.py'): ${outcomes.length}`
	);
	if (outcomes.length === 0) {
		console.log("no candidates found — nothing to migrate.");
		return;
	}
	printReport(outcomes, apply);
}

function printReport(outcomes: MigrationOutcome[], apply: boolean) {
	console.log("");
	console.log("id\tinteractive?\taction\t\ttitle (checker_path)");
	console.log("--\t------------\t------\t\t---------------------");
	for (const o of outcomes) {
		const detectedLabel = o.detected === "download_failed" ? "?" : o.detected ? "yes" : "no";
		let action: string;
		if (o.detected === "download_failed") action = "skipped (download failed)";
		else if (!o.detected) action = "no-op";
		else if (o.applied) action = "APPLIED (special_judge -> interactive)";
		else action = "would apply (dry-run)";
		console.log(`${o.id}\t${detectedLabel}\t\t${action}\t${o.title} (${o.checkerPath})`);
	}

	const matched = outcomes.filter((o) => o.detected === true).length;
	const appliedCount = outcomes.filter((o) => o.applied).length;
	const failed = outcomes.filter((o) => o.detected === "download_failed").length;
	console.log("");
	console.log(
		`summary: ${outcomes.length} scanned, ${matched} detected as interactive, ` +
			`${appliedCount} applied, ${failed} skipped (download failed).`
	);
	if (!apply && matched > 0) {
		console.log("dry-run only — re-run with --apply to persist the problem_type change.");
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("migration script failed:", err);
		process.exit(1);
	});
