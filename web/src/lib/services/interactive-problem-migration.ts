import "server-only";

import { and, eq, isNotNull, like } from "drizzle-orm";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { acquireRedisLock, releaseRedisLock } from "@/lib/redis-lock";
import { downloadFile } from "@/lib/storage/operations";

/**
 * 레거시 인터랙티브 문제 마이그레이션 — `problem_type='special_judge'` + Python SDK 체커
 * (`aoj_checker.Interactive`)로 등록된 문제를 `problem_type='interactive'`로 되돌린다.
 *
 * DB 행만으로는 인터랙티브 여부를 알 수 없고(체커 소스는 MinIO) 판별에 다운로드가 필요하므로
 * SQL 마이그레이션이 아닌 코드로 수행한다. judge는 special_judge 문제에 대한 런타임 문자열
 * 감지 폴백을 유지하므로 미이관 문제도 정상 채점된다 — 이 마이그레이션은 표시/디스패치 정합용.
 *
 * 배포가 자동(GitHub runner → `make prod-up`)이라 수동 실행 단계는 신뢰할 수 없다. 따라서
 * `runLegacyInteractiveMigrationOnce`가 web 기동 시 Redis 락 하에 멱등 실행된다(첫 실행 후
 * 후보 0건 = SELECT 1회 비용). `web/scripts/migrate-interactive-problems.ts`는 같은 로직의
 * dry-run/수동 도구.
 */

// NOTE: keep these three substrings in sync with
// `judge/src/components/checker.rs::is_interactive_checker`. Do not drift.
export const INTERACTIVE_CHECKER_MARKERS = [
	"from aoj_checker import Interactive",
	"from aoj_checker import Interactive,",
	", Interactive",
] as const;

export function isInteractiveChecker(source: string): boolean {
	return INTERACTIVE_CHECKER_MARKERS.some((marker) => source.includes(marker));
}

export type MigrationCandidate = {
	id: number;
	title: string;
	checkerPath: string;
};

export type MigrationOutcome = MigrationCandidate & {
	detected: boolean | "download_failed";
	applied: boolean;
};

/**
 * 후보(special_judge + .py 체커)를 스캔해 인터랙티브 체커를 감지하고, `apply`가 true면
 * `problem_type='interactive'`로 갱신한다. 다운로드 실패는 해당 문제만 skip(전체 중단 없음).
 */
export async function migrateLegacyInteractiveProblems(opts: {
	apply: boolean;
}): Promise<MigrationOutcome[]> {
	const candidates: MigrationCandidate[] = await db
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

	const outcomes: MigrationOutcome[] = [];

	for (const candidate of candidates) {
		let source: string;
		try {
			source = (await downloadFile(candidate.checkerPath)).toString("utf-8");
		} catch (err) {
			console.warn(
				`[interactive-migration] skip problem #${candidate.id} "${candidate.title}": ` +
					`failed to download checker "${candidate.checkerPath}": ` +
					`${err instanceof Error ? err.message : String(err)}`
			);
			outcomes.push({ ...candidate, detected: "download_failed", applied: false });
			continue;
		}

		const detected = isInteractiveChecker(source);
		let applied = false;

		if (detected && opts.apply) {
			await db
				.update(problems)
				.set({ problemType: "interactive" })
				.where(eq(problems.id, candidate.id));
			applied = true;
		}

		outcomes.push({ ...candidate, detected, applied });
	}

	return outcomes;
}

const STARTUP_LOCK_KEY = "judge:migrate-interactive";
const STARTUP_LOCK_TTL_SEC = 300;

/**
 * web 기동 시 1회 자동 실행용. 다중 인스턴스에서도 Redis 락으로 한 인스턴스만 수행하며,
 * 실패는 로그만 남긴다(기동을 막지 않음 — judge 폴백이 있어 미이관 상태도 안전).
 */
export async function runLegacyInteractiveMigrationOnce(): Promise<void> {
	const lock = await acquireRedisLock(STARTUP_LOCK_KEY, STARTUP_LOCK_TTL_SEC);
	if (!lock) return;
	try {
		const outcomes = await migrateLegacyInteractiveProblems({ apply: true });
		const applied = outcomes.filter((o) => o.applied);
		if (applied.length > 0) {
			console.log(
				`[interactive-migration] migrated ${applied.length} problem(s) to interactive: ` +
					applied.map((o) => `#${o.id}`).join(", ")
			);
		}
	} catch (e) {
		console.error("[interactive-migration] startup migration failed:", e);
	} finally {
		await releaseRedisLock(lock);
	}
}
