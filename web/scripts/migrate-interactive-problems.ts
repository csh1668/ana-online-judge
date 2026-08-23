/**
 * Migrate legacy interactive problems from `problem_type='special_judge'`
 * (Python SDK checker using `aoj_checker.Interactive`) to `problem_type='interactive'`.
 *
 * Background: before `interactive` was a first-class `problemType`, interactive
 * problems were registered as `special_judge` with a Python checker that imports
 * `aoj_checker.Interactive`. DB rows alone can't tell interactive checkers apart
 * from ordinary special-judge checkers — the checker *source* lives in MinIO — so
 * this is a one-off script rather than a SQL migration. The judge still carries a
 * runtime string-detection fallback for `special_judge` problems, so problems left
 * unmigrated keep working correctly; this script only cleans up `problem_type` for
 * display/dispatch consistency.
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
 * Default: dry-run (lists candidates and detection results only).
 * Pass `--apply` to actually UPDATE matching problems' `problem_type`.
 *
 * Download failures (missing/unreachable checker object) skip that problem with a
 * warning — they never abort the whole run.
 */

import { and, eq, isNotNull, like } from "drizzle-orm";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { downloadFile } from "@/lib/storage/operations";

// NOTE: keep these three substrings in sync with
// `judge/src/components/checker.rs::is_interactive_checker`. Do not drift.
const INTERACTIVE_CHECKER_MARKERS = [
	"from aoj_checker import Interactive",
	"from aoj_checker import Interactive,",
	", Interactive",
];

function isInteractiveChecker(source: string): boolean {
	return INTERACTIVE_CHECKER_MARKERS.some((marker) => source.includes(marker));
}

type Candidate = {
	id: number;
	title: string;
	checkerPath: string;
};

type Outcome = Candidate & {
	detected: boolean | "download_failed";
	applied: boolean;
};

async function main() {
	const apply = process.argv.includes("--apply");

	const candidates: Candidate[] = await db
		.select({
			id: problems.id,
			title: problems.displayTitle,
			checkerPath: problems.checkerPath,
		})
		.from(problems)
		.where(
			and(
				eq(problems.problemType, "special_judge"),
				isNotNull(problems.checkerPath),
				like(problems.checkerPath, "%.py")
			)
		)
		.then((rows) =>
			rows.map((row) => ({ id: row.id, title: row.title, checkerPath: row.checkerPath as string }))
		);

	console.log(`mode: ${apply ? "APPLY" : "DRY-RUN"}`);
	console.log(
		`candidates (problem_type='special_judge' AND checker_path LIKE '%.py'): ${candidates.length}`
	);

	if (candidates.length === 0) {
		console.log("no candidates found — nothing to migrate.");
		return;
	}

	const outcomes: Outcome[] = [];

	for (const candidate of candidates) {
		let source: string;
		try {
			source = (await downloadFile(candidate.checkerPath)).toString("utf-8");
		} catch (err) {
			console.warn(
				`  [skip] problem #${candidate.id} "${candidate.title}": failed to download checker at ` +
					`"${candidate.checkerPath}": ${err instanceof Error ? err.message : String(err)}`
			);
			outcomes.push({ ...candidate, detected: "download_failed", applied: false });
			continue;
		}

		const detected = isInteractiveChecker(source);
		let applied = false;

		if (detected && apply) {
			await db
				.update(problems)
				.set({ problemType: "interactive" })
				.where(eq(problems.id, candidate.id));
			applied = true;
		}

		outcomes.push({ ...candidate, detected, applied });
	}

	printReport(outcomes, apply);
}

function printReport(outcomes: Outcome[], apply: boolean) {
	console.log("");
	console.log("id\tinteractive?\taction\t\ttitle (checker_path)");
	console.log("--\t------------\t------\t\t---------------------");
	for (const o of outcomes) {
		const detectedLabel = o.detected === "download_failed" ? "?" : o.detected ? "yes" : "no";
		let action: string;
		if (o.detected === "download_failed") action = "skipped (download failed)";
		else if (!o.detected) action = "no-op";
		else if (o.applied) action = "APPLIED (special_judge -> interactive)";
		else action = apply ? "no-op (apply had no effect?)" : "would apply (dry-run)";
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
