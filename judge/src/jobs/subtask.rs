//! Pure helpers for IOI-style subtask aggregation.
//!
//! The judge collects per-testcase verdicts; this module decides, given a
//! slice of verdicts paired with their subtask_group and score, what the
//! overall score and verdict should be. Kept pure so it is easily unit tested.

use crate::core::verdict::Verdict;

#[derive(Debug, Clone, Copy)]
pub struct TestcaseOutcome {
    pub subtask_group: i32,
    pub score: i64,
    pub verdict: Verdict,
    /// Partial score ratio in `[0.0, 1.0]`, present only when `verdict ==
    /// Verdict::Partial` (checker returned testlib `POINTS_EXIT_CODE`).
    /// `None` for every other verdict, including `Accepted` (whose ratio is
    /// implicitly 1.0).
    pub partial_ratio: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct SubtaskAggregate {
    pub final_score: i64,
    pub overall_verdict: Verdict,
}

/// Aggregate per-testcase outcomes into a final subtask-aware score + verdict.
///
/// Rules (IOI-style "GroupMin"):
/// - Group by subtask_group. For each group:
///   - If every TC in the group is `Accepted` or `Partial` (checker partial
///     credit via testlib `POINTS_EXIT_CODE`), the group score is
///     `⌊(Σ tc.score) × min(ratio)⌋`, where `ratio` is 1.0 for `Accepted`
///     and `tc.partial_ratio` for `Partial`. When every TC in the group is
///     `Accepted` (no `Partial`), `min(ratio) == 1.0` and this reduces to
///     the original `Σ tc.score` — the plain-AC/WA behavior is unchanged.
///   - Otherwise (any other verdict present — WA/TLE/MLE/RE/.../Skipped),
///     the group score is 0 (fail-fast within the group is unaffected: a
///     `Partial` TC does not itself stop the group, but a genuine failure
///     still zeroes it).
/// - final_score = Σ group scores.
/// - Overall verdict:
///   - final_score == max_score → Accepted
///   - 0 < final_score < max_score → Partial
///   - final_score == 0 → first non-{Accepted,Partial} verdict encountered
///     when iterating groups in ascending subtask_group order (a `Partial`
///     testcase alone is never chosen as the failure verdict, since
///     `Partial` is not itself a failure — see `mixed_within_subtask`
///     handling below).
pub fn aggregate_subtasks(outcomes: &[TestcaseOutcome], max_score: i64) -> SubtaskAggregate {
    if outcomes.is_empty() {
        return SubtaskAggregate {
            final_score: 0,
            overall_verdict: Verdict::SystemError,
        };
    }

    let mut groups: std::collections::BTreeMap<i32, Vec<&TestcaseOutcome>> =
        std::collections::BTreeMap::new();
    for o in outcomes {
        groups.entry(o.subtask_group).or_default().push(o);
    }

    let mut final_score = 0i64;
    let mut first_failure: Option<Verdict> = None;

    for (_g, items) in groups.iter() {
        let all_ac_or_partial = items
            .iter()
            .all(|i| matches!(i.verdict, Verdict::Accepted | Verdict::Partial));
        if all_ac_or_partial {
            let sum_scores: i64 = items.iter().map(|i| i.score).sum();
            let min_ratio = items
                .iter()
                .map(|i| match i.verdict {
                    Verdict::Accepted => 1.0,
                    Verdict::Partial => i.partial_ratio.unwrap_or(0.0),
                    _ => unreachable!("filtered to Accepted | Partial above"),
                })
                .fold(1.0_f64, f64::min);
            final_score += ((sum_scores as f64) * min_ratio).floor() as i64;
        } else if first_failure.is_none() {
            first_failure = items
                .iter()
                .find(|i| !matches!(i.verdict, Verdict::Accepted | Verdict::Partial))
                .map(|i| i.verdict);
        }
    }

    let overall_verdict = if final_score == max_score {
        Verdict::Accepted
    } else if final_score > 0 {
        Verdict::Partial
    } else {
        first_failure.unwrap_or(Verdict::WrongAnswer)
    };

    SubtaskAggregate {
        final_score,
        overall_verdict,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tc(g: i32, s: i64, v: Verdict) -> TestcaseOutcome {
        TestcaseOutcome {
            subtask_group: g,
            score: s,
            verdict: v,
            partial_ratio: None,
        }
    }

    fn tc_partial(g: i32, s: i64, ratio: f64) -> TestcaseOutcome {
        TestcaseOutcome {
            subtask_group: g,
            score: s,
            verdict: Verdict::Partial,
            partial_ratio: Some(ratio),
        }
    }

    #[test]
    fn all_accepted_gives_accepted() {
        let outs = vec![tc(1, 30, Verdict::Accepted), tc(2, 70, Verdict::Accepted)];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 100);
        assert_eq!(r.overall_verdict, Verdict::Accepted);
    }

    #[test]
    fn one_group_fails_gives_partial() {
        let outs = vec![
            tc(1, 30, Verdict::Accepted),
            tc(1, 30, Verdict::Accepted),
            tc(2, 70, Verdict::WrongAnswer),
        ];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 60);
        assert_eq!(r.overall_verdict, Verdict::Partial);
    }

    #[test]
    fn first_group_partial_fail_zero_score_gives_failure_verdict() {
        let outs = vec![
            tc(1, 30, Verdict::TimeLimitExceeded),
            tc(2, 70, Verdict::WrongAnswer),
        ];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 0);
        assert_eq!(r.overall_verdict, Verdict::TimeLimitExceeded);
    }

    #[test]
    fn mixed_within_subtask_zeroes_that_subtask() {
        let outs = vec![
            tc(1, 10, Verdict::Accepted),
            tc(1, 20, Verdict::WrongAnswer),
            tc(2, 70, Verdict::Accepted),
        ];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 70);
        assert_eq!(r.overall_verdict, Verdict::Partial);
    }

    #[test]
    fn empty_outcomes_gives_system_error() {
        let r = aggregate_subtasks(&[], 100);
        assert_eq!(r.final_score, 0);
        assert_eq!(r.overall_verdict, Verdict::SystemError);
    }

    #[test]
    fn empty_outcomes_with_zero_max_score_still_system_error() {
        // Don't silently report Accepted on 0==0.
        let r = aggregate_subtasks(&[], 0);
        assert_eq!(r.overall_verdict, Verdict::SystemError);
    }

    #[test]
    fn all_skipped_gives_skipped_verdict() {
        let outs = vec![
            TestcaseOutcome {
                subtask_group: 1,
                score: 50,
                verdict: Verdict::Skipped,
                partial_ratio: None,
            },
            TestcaseOutcome {
                subtask_group: 2,
                score: 50,
                verdict: Verdict::Skipped,
                partial_ratio: None,
            },
        ];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 0);
        assert_eq!(r.overall_verdict, Verdict::Skipped);
    }

    #[test]
    fn first_failure_picks_ascending_group_order() {
        // Group 2 fails first in the input order but group 1 should win.
        let outs = vec![
            TestcaseOutcome {
                subtask_group: 2,
                score: 70,
                verdict: Verdict::WrongAnswer,
                partial_ratio: None,
            },
            TestcaseOutcome {
                subtask_group: 1,
                score: 30,
                verdict: Verdict::TimeLimitExceeded,
                partial_ratio: None,
            },
        ];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 0);
        assert_eq!(r.overall_verdict, Verdict::TimeLimitExceeded);
    }

    // --- GroupMin (checker partial score) tests ---

    #[test]
    fn group_min_partial_scales_group_score() {
        // Group 1 has one full-credit AC (score 60) and one half-credit
        // Partial (score 40): min(ratio) = min(1.0, 0.5) = 0.5, so the group
        // awards floor((60 + 40) * 0.5) = 50, not the plain sum (100).
        let outs = vec![tc(1, 60, Verdict::Accepted), tc_partial(1, 40, 0.5)];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 50);
        assert_eq!(r.overall_verdict, Verdict::Partial);
    }

    #[test]
    fn group_min_all_full_ratio_matches_legacy_sum() {
        // Every TC in the group is Accepted (ratio 1.0 implicitly) — GroupMin
        // must reduce to exactly the pre-existing Σ tc.score behavior.
        let outs = vec![tc(1, 30, Verdict::Accepted), tc(2, 70, Verdict::Accepted)];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 100);
        assert_eq!(r.overall_verdict, Verdict::Accepted);
    }

    #[test]
    fn group_min_partial_and_wrong_answer_mixed_gives_zero() {
        // A group containing a Partial alongside a genuine failure (WA) is
        // not "all Accepted|Partial", so the whole group scores 0 — and the
        // WA (not the Partial) is surfaced as the failure verdict.
        let outs = vec![tc_partial(1, 50, 0.5), tc(1, 50, Verdict::WrongAnswer)];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 0);
        assert_eq!(r.overall_verdict, Verdict::WrongAnswer);
    }
}
