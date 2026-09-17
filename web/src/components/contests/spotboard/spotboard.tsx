/*
 * Based on Spotboard (https://github.com/spotboard/spotboard)
 * Copyright (c) Spotboard (Jongwook Choi, Wonha Ryu)
 * Licensed under the MIT License
 */

"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerTime } from "@/hooks/use-server-time";
import { formatDuration } from "@/lib/contest-utils";
import { ContestLogic, Run, type TeamStatus } from "@/lib/spotboard/contest";
import type { SpotboardConfig, SpotboardRun } from "@/lib/spotboard/types";
import { RefreshProgress } from "./refresh-progress";
import { TeamRow } from "./team-row";
import { hsvToRgb } from "./utils";
import "./spotboard.css";

interface SpotboardProps {
	config: SpotboardConfig;
	isAwardMode?: boolean;
	isAdmin?: boolean;
	lastUpdate?: Date;
	refreshIntervalMs?: number;
	isRefreshing?: boolean;
	adminToolbar?: ReactNode;
}

export type FlipPhase = "flip-before" | "flip-after";

export interface FlipAnimationState {
	teamId: number;
	problemId: number;
	phase: FlipPhase;
}

// Duration of each flip half (must match CSS animation-duration)
const FLIP_HALF_MS = 250;

function ContestRemainingTime({ startTime, endTime }: { startTime: number; endTime: number }) {
	const { serverNow } = useServerTime();

	let label: string;
	let value: string | null;
	if (serverNow < startTime) {
		label = "시작까지";
		value = formatDuration(startTime - serverNow);
	} else if (serverNow <= endTime) {
		label = "남은 시간";
		value = formatDuration(endTime - serverNow);
	} else {
		label = "종료됨";
		value = null;
	}

	return (
		<div id="contest-remaining-time">
			<span className="contest-remaining-label">{label}</span>
			{value && <span className="contest-remaining-value">{value}</span>}
		</div>
	);
}

export function Spotboard({
	config,
	isAwardMode = false,
	isAdmin = false,
	lastUpdate,
	refreshIntervalMs,
	isRefreshing = false,
	adminToolbar,
}: SpotboardProps) {
	const showRefreshProgress =
		!isAwardMode && lastUpdate !== undefined && refreshIntervalMs !== undefined;

	const [logic, setLogic] = useState<ContestLogic | null>(null);
	const [rankedTeams, setRankedTeams] = useState<{ teamId: number; status: TeamStatus }[]>([]);
	const [hiddenRuns, setHiddenRuns] = useState<SpotboardRun[]>([]);

	// Award Ceremony State
	const [finalizedTeams, setFinalizedTeams] = useState<Set<number>>(new Set());
	const [focusedTeamId, setFocusedTeamId] = useState<number | null>(null);
	const [revealedTeams, setRevealedTeams] = useState<Set<number>>(new Set());
	const [animating, setAnimating] = useState<FlipAnimationState | null>(null);
	const animatingRef = useRef(false);
	// Skip support: pressing the advance key again mid-reveal fast-forwards the remaining
	// flips of the current problem instead of being ignored.
	const skipRef = useRef(false);
	// Resolver for the in-flight flip half, so a skip can cut the current sleep short.
	const flipResolveRef = useRef<(() => void) | null>(null);

	// Stable anonymous IDs for teams (used to render "User N" before reveal in award mode)
	const anonymousIds = useMemo(() => {
		const m = new Map<number, number>();
		config.teams.forEach((t, idx) => {
			m.set(t.id, idx + 1);
		});
		return m;
	}, [config.teams]);

	// First solver per problem from the currently-visible state. Recomputed whenever rankedTeams
	// changes (i.e. after refreshes and after award-mode reveals), so the highlight tracks reality.
	// Ties at the same minute all share the highlight.
	const firstSolversByProblem = useMemo(() => {
		const map = new Map<number, Set<number>>();
		for (const prob of config.problems) {
			if (prob.problemType === "anigma") continue;
			let bestTime = Number.POSITIVE_INFINITY;
			const ids = new Set<number>();
			for (const { teamId, status } of rankedTeams) {
				const pStatus = status.getProblemStatus(prob.id, prob.problemType);
				if (!pStatus.isAccepted()) continue;
				const t = pStatus.getSolvedTime();
				if (t === null) continue;
				if (t < bestTime) {
					bestTime = t;
					ids.clear();
					ids.add(teamId);
				} else if (t === bestTime) {
					ids.add(teamId);
				}
			}
			if (ids.size > 0) map.set(prob.id, ids);
		}
		return map;
	}, [rankedTeams, config.problems]);

	// Initialize logic
	useEffect(() => {
		const l = new ContestLogic(config.teams, config.problems, config.penaltyMinutes);

		// Belt-and-suspenders cutoff at contest end. The server query already trims by
		// createdAt <= endTime, but if anything slips through (e.g. admin shortened
		// endTime after submissions came in) we don't want stray runs producing rows
		// or, in award mode, no-op flips.
		const durationSec =
			config.startTime !== undefined && config.endTime !== undefined
				? Math.floor((config.endTime - config.startTime) / 1000)
				: null;
		const inContestRuns =
			durationSec !== null ? config.runs.filter((r) => r.time <= durationSec) : config.runs;

		let initialRuns: SpotboardRun[] = inContestRuns;
		const hidden: SpotboardRun[] = [];

		if (isAwardMode && config.freezeTime) {
			// In award mode:
			// 1. Add runs before freeze time (normal state)
			const beforeFreeze = inContestRuns.filter((r) => r.time < config.freezeTime!);
			const afterFreeze = inContestRuns.filter((r) => r.time >= config.freezeTime!);

			// 2. Trim runs that wouldn't change the cell — they'd just trigger no-op flips.
			//    a) If a (team, problem) is already accepted before freeze, drop all frozen runs.
			//    b) Otherwise, keep frozen runs up to and including the first "Yes"; drop the rest.
			//    ANIGMA is a cumulative-score model, so every run can still matter — keep them all.
			const solvedBeforeFreeze = new Set<string>();
			for (const r of beforeFreeze) {
				if (r.result === "Yes") solvedBeforeFreeze.add(`${r.teamId}:${r.problemId}`);
			}

			const grouped = new Map<string, SpotboardRun[]>();
			for (const r of afterFreeze) {
				const key = `${r.teamId}:${r.problemId}`;
				let bucket = grouped.get(key);
				if (!bucket) {
					bucket = [];
					grouped.set(key, bucket);
				}
				bucket.push(r);
			}

			for (const [key, runs] of grouped) {
				const isAnigma = runs[0].problemType === "anigma";
				if (!isAnigma && solvedBeforeFreeze.has(key)) continue;

				runs.sort((a, b) => a.time - b.time || a.id - b.id);
				if (isAnigma) {
					hidden.push(...runs);
				} else {
					for (const r of runs) {
						hidden.push(r);
						if (r.result === "Yes") break;
					}
				}
			}

			// 3. CRITICAL: Add the (trimmed) frozen runs as PENDING state to mask them
			const frozenRunsAsPending = hidden.map((r) => ({
				...r,
				result: "Pending", // Mask the actual result
			}));

			initialRuns = [...beforeFreeze, ...frozenRunsAsPending];
		}

		for (const run of initialRuns) {
			l.addRun(
				new Run(
					run.id,
					run.teamId,
					run.problemId,
					run.time,
					run.result,
					run.score,
					run.problemType,
					run.anigmaDetails,
					run.passedTestcases
				)
			);
		}

		setLogic(l);
		setRankedTeams(l.getRankedTeams());
		setHiddenRuns(hidden);
		setFinalizedTeams(new Set());
		setFocusedTeamId(null);
		setRevealedTeams(new Set());
		setAnimating(null);
		animatingRef.current = false;
		skipRef.current = false;
		flipResolveRef.current = null;
	}, [config, isAwardMode]);

	// Animation frame or update trigger
	const updateRankings = useCallback(() => {
		if (logic) {
			setRankedTeams([...logic.getRankedTeams()]);
		}
	}, [logic]);

	// Initialize dynamic styles for problem labels (A, B, C, etc.)
	useEffect(() => {
		if (!config) return;

		const styleId = "spotboard-dynamic-styles";
		let style = document.getElementById(styleId) as HTMLStyleElement;

		if (!style) {
			style = document.createElement("style");
			style.id = styleId;
			document.head.appendChild(style);
		}

		let css = "";

		// Add problem letter labels to problem-result boxes
		config.problems.forEach((prob) => {
			css += `.problem-result.problem-${prob.id} b:before { content: "${prob.title}"; }
`;
		});

		// Add solved-count background colors for each solved level
		const solvedLevels = config.problems.length + 1;
		for (let i = 0; i <= solvedLevels; i++) {
			const ratio = i / solvedLevels;
			const h = (-2 / 360) * (1 - ratio) + (105 / 360) * ratio;
			let s = 0.96;
			let v = 0.31;

			if (i % 2 === 1) {
				s = Math.max(s - 0.15, 0);
				v = Math.min(v + 0.1, 1);
			}

			const rgb = hsvToRgb(h, s, v);
			css += `.solved-${i} .solved-count { background-color: ${rgb}; }
`;
		}

		style.textContent = css;
	}, [config]);

	// One flip half. Resolves early when a skip is requested mid-sleep.
	const waitFlipHalf = useCallback(() => {
		if (skipRef.current) return Promise.resolve();
		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				flipResolveRef.current = null;
				resolve();
			}, FLIP_HALF_MS);
			flipResolveRef.current = () => {
				clearTimeout(timer);
				flipResolveRef.current = null;
				resolve();
			};
		});
	}, []);

	/** Fast-forward the running reveal. Returns false when nothing is animating. */
	const requestSkip = useCallback(() => {
		if (!animatingRef.current) return false;
		skipRef.current = true;
		flipResolveRef.current?.();
		return true;
	}, []);

	// Award ceremony step (ICPC Style)
	// Each press performs ONE step:
	//   - If no focused team: pick the lowest non-finalized team and focus it (revealing its name)
	//   - Else if focused team has pending problems: reveal ONE problem (animating each run individually)
	//       After reveal: if the team's rank improved, unfocus (next step will pick a new lowest)
	//   - Else: finalize the focused team
	const revealNext = useCallback(async () => {
		if (!logic) return;
		if (animatingRef.current) return;

		// 1. No focused team: pick lowest non-finalized team and focus it
		if (focusedTeamId === null) {
			const currentStandings = logic.getRankedTeams();
			let targetTeamId: number | null = null;
			for (let i = currentStandings.length - 1; i >= 0; i--) {
				if (!finalizedTeams.has(currentStandings[i].teamId)) {
					targetTeamId = currentStandings[i].teamId;
					break;
				}
			}
			if (targetTeamId === null) return;

			setFocusedTeamId(targetTeamId);
			setRevealedTeams((prev) => {
				const next = new Set(prev);
				next.add(targetTeamId!);
				return next;
			});
			return;
		}

		// 2. Focused team: find next pending problem (in problem display order)
		const myHidden = hiddenRuns.filter((r) => r.teamId === focusedTeamId);
		if (myHidden.length === 0) {
			// No more pending problems -> finalize this team
			setFinalizedTeams((prev) => {
				const next = new Set(prev);
				next.add(focusedTeamId);
				return next;
			});
			setFocusedTeamId(null);
			return;
		}

		let targetProblemId: number | null = null;
		for (const prob of config.problems) {
			if (myHidden.some((r) => r.problemId === prob.id)) {
				targetProblemId = prob.id;
				break;
			}
		}
		if (targetProblemId === null) return;

		// 3. Reveal every attempt for this problem — both pre-freeze (already applied) and
		//    post-freeze (currently hidden). We strip pStatus to empty on the first flip so
		//    the attempt counter ticks up from 0 across the full animation, giving one flip
		//    per total attempt instead of one flip per frozen attempt only.
		const hiddenForProblem = myHidden
			.filter((r) => r.problemId === targetProblemId)
			.sort((a, b) => a.time - b.time || a.id - b.id);
		const hiddenIds = new Set(hiddenForProblem.map((r) => r.id));

		const pStatus = logic.teamStatuses
			.get(focusedTeamId)
			?.getProblemStatus(targetProblemId, hiddenForProblem[0].problemType);
		const preFreezeRuns: SpotboardRun[] = pStatus
			? pStatus.runs.filter((r) => !hiddenIds.has(r.id))
			: [];

		const runsToReveal: SpotboardRun[] = [...preFreezeRuns, ...hiddenForProblem].sort(
			(a, b) => a.time - b.time || a.id - b.id
		);

		const oldRank = logic.teamStatuses.get(focusedTeamId)?.rank ?? 0;

		animatingRef.current = true;
		skipRef.current = false;

		try {
			for (let i = 0; i < runsToReveal.length; i++) {
				const run = runsToReveal[i];

				// Phase A: rotateX(0 -> 90deg)
				setAnimating({
					teamId: focusedTeamId,
					problemId: targetProblemId,
					phase: "flip-before",
				});
				await waitFlipHalf();

				// At mid-flip (perpendicular to screen, invisible): apply the run. On the
				// first iteration also reset pStatus.runs (dropping pre-freeze actuals AND
				// post-freeze placeholders) and clear hiddenRuns for this problem so the
				// counter restarts from 0 — otherwise pre-freeze attempts would persist and
				// the first flip would jump from attempt N to attempt N+1.
				if (i === 0) {
					if (pStatus) {
						pStatus.runs = [];
					}
					setHiddenRuns((prev) =>
						prev.filter((r) => !(r.teamId === focusedTeamId && r.problemId === targetProblemId))
					);
				}

				logic.addRun(
					new Run(
						run.id,
						run.teamId,
						run.problemId,
						run.time,
						run.result,
						run.score,
						run.problemType,
						run.anigmaDetails,
						run.passedTestcases
					)
				);
				updateRankings();

				// Phase B: rotateX(270 -> 360deg)
				setAnimating({
					teamId: focusedTeamId,
					problemId: targetProblemId,
					phase: "flip-after",
				});
				await waitFlipHalf();
			}
		} finally {
			setAnimating(null);
			animatingRef.current = false;
			skipRef.current = false;
			flipResolveRef.current = null;
		}

		// 4. If this reveal changed the team's rank, hand focus over to the next lowest
		const newRank = logic.teamStatuses.get(focusedTeamId)?.rank ?? 0;
		if (newRank < oldRank) {
			setFocusedTeamId(null);
		}
	}, [
		logic,
		hiddenRuns,
		focusedTeamId,
		finalizedTeams,
		updateRankings,
		config.problems,
		waitFlipHalf,
	]);

	useEffect(() => {
		if (!isAwardMode) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "ArrowRight" && e.key !== "Enter") return;
			// Key auto-repeat would otherwise skip every reveal while the key is held down.
			if (e.repeat) return;
			// Mid-animation press = skip the remaining flips of the current reveal.
			if (requestSkip()) return;
			void revealNext();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isAwardMode, revealNext, requestSkip]);

	if (!logic) return <div>Loading Spotboard...</div>;

	return (
		<div className="spotboard-container">
			<div id="header">
				<div className="spotboard-header-left">
					{isAdmin && <div className="spotboard-admin-badge">(admin)</div>}
					<div id="contest-title">
						{config.contestTitle}
						{(config.isFrozen || hiddenRuns.length > 0) && (
							<span className="text-muted-foreground ml-2">(Frozen)</span>
						)}
					</div>
				</div>
				<div className="spotboard-header-right">
					{config.startTime !== undefined && config.endTime !== undefined && (
						<ContestRemainingTime startTime={config.startTime} endTime={config.endTime} />
					)}
					{showRefreshProgress && (
						<RefreshProgress
							lastUpdate={lastUpdate as Date}
							intervalMs={refreshIntervalMs as number}
							isRefreshing={isRefreshing}
						/>
					)}
					{adminToolbar}
				</div>
			</div>

			<div id="wrapper">
				{/* Each team row is positioned via `top: i * 2.0em` where em resolves against the team's own
				    font-size (2em of team-list). That makes the actual stack height = length * 4em in
				    team-list's em-space, so the container must match — otherwise rows past the midpoint
				    overflow the wrapper and the page background shows through. */}
				<div id="team-list" style={{ height: `${rankedTeams.length * 4.0}em` }}>
					{rankedTeams.map((item, index) => {
						const team = config.teams.find((t) => t.id === item.teamId);
						if (!team) return null;

						return (
							<TeamRow
								key={team.id}
								team={team}
								status={item.status}
								index={index}
								config={config}
								hiddenRuns={hiddenRuns}
								isFinalized={finalizedTeams.has(team.id)}
								isFocused={focusedTeamId === team.id}
								isAwardMode={isAwardMode}
								isRevealed={revealedTeams.has(team.id) || finalizedTeams.has(team.id)}
								anonymousId={anonymousIds.get(team.id) ?? team.id}
								animating={animating}
								rankedTeams={rankedTeams}
								firstSolversByProblem={firstSolversByProblem}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}
