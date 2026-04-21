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
}

#[derive(Debug, Clone)]
pub struct SubtaskAggregate {
    pub final_score: i64,
    pub overall_verdict: Verdict,
}

/// Aggregate per-testcase outcomes into a final subtask-aware score + verdict.
///
/// Rules (IOI-style):
/// - Group by subtask_group. For each group, if every TC is Accepted, award
///   Σ tc.score; otherwise 0.
/// - final_score = Σ group scores.
/// - Overall verdict:
///   - final_score == max_score → Accepted
///   - 0 < final_score < max_score → Partial
///   - final_score == 0 → first non-Accepted verdict encountered when
///     iterating groups in ascending subtask_group order.
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
        let all_ac = items.iter().all(|i| i.verdict == Verdict::Accepted);
        if all_ac {
            final_score += items.iter().map(|i| i.score).sum::<i64>();
        } else if first_failure.is_none() {
            first_failure = items
                .iter()
                .find(|i| i.verdict != Verdict::Accepted)
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
            },
            TestcaseOutcome {
                subtask_group: 2,
                score: 50,
                verdict: Verdict::Skipped,
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
            },
            TestcaseOutcome {
                subtask_group: 1,
                score: 30,
                verdict: Verdict::TimeLimitExceeded,
            },
        ];
        let r = aggregate_subtasks(&outs, 100);
        assert_eq!(r.final_score, 0);
        assert_eq!(r.overall_verdict, Verdict::TimeLimitExceeded);
    }
}
