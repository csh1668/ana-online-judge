import type { Verdict } from "@/db/schema";

/**
 * Workshop expected verdict enum values (mirrors schema.workshopExpectedVerdictEnum).
 */
export type WorkshopExpectedVerdict =
	| "accepted"
	| "wrong_answer"
	| "time_limit"
	| "memory_limit"
	| "runtime_error"
	| "presentation_error"
	| "tl_or_ml";

/**
 * Pending verdicts (no match/mismatch determination yet).
 */
const PENDING_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>(["pending", "judging"]);

/**
 * True if the job has not yet produced a final verdict. Matrix cells render grey.
 */
export function isPending(actual: Verdict | null | undefined): boolean {
	if (!actual) return true;
	return PENDING_VERDICTS.has(actual);
}

/**
 * Returns true if `actual` matches the user's expectation.
 * - `tl_or_ml` matches if actual is `time_limit_exceeded` OR `memory_limit_exceeded`
 * - all other expected values map to a single judge verdict string
 *
 * System-level failures (`compile_error`, `system_error`, `fail`, `skipped`,
 * `partial`) never match any expected verdict and render as red.
 */
export function matchesExpectedVerdict(
	expected: WorkshopExpectedVerdict,
	actual: Verdict
): boolean {
	switch (expected) {
		case "accepted":
			return actual === "accepted";
		case "wrong_answer":
			return actual === "wrong_answer";
		case "time_limit":
			return actual === "time_limit_exceeded";
		case "memory_limit":
			return actual === "memory_limit_exceeded";
		case "runtime_error":
			return actual === "runtime_error";
		case "presentation_error":
			return actual === "presentation_error";
		case "tl_or_ml":
			return actual === "time_limit_exceeded" || actual === "memory_limit_exceeded";
	}
}

/**
 * Short human label for UI chips. Korean to match the rest of the workshop UI.
 */
export function expectedVerdictLabel(v: WorkshopExpectedVerdict): string {
	switch (v) {
		case "accepted":
			return "AC";
		case "wrong_answer":
			return "WA";
		case "time_limit":
			return "TLE";
		case "memory_limit":
			return "MLE";
		case "runtime_error":
			return "RE";
		case "presentation_error":
			return "PE";
		case "tl_or_ml":
			return "TLE/MLE";
	}
}

/**
 * Short display string for an actual judge verdict. Keeps matrix cells narrow.
 */
export function verdictShortLabel(v: Verdict): string {
	switch (v) {
		case "accepted":
			return "AC";
		case "wrong_answer":
			return "WA";
		case "time_limit_exceeded":
			return "TLE";
		case "memory_limit_exceeded":
			return "MLE";
		case "runtime_error":
			return "RE";
		case "compile_error":
			return "CE";
		case "presentation_error":
			return "PE";
		case "system_error":
			return "SE";
		case "skipped":
			return "SK";
		case "fail":
			return "FAIL";
		case "partial":
			return "PART";
		case "pending":
			return "…";
		case "judging":
			return "…";
	}
}
