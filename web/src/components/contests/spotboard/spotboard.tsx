/*
 * Based on Spotboard (https://github.com/spotboard/spotboard)
 * Copyright (c) Spotboard (Jongwook Choi, Wonha Ryu)
 * Licensed under the MIT License
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { ContestLogic, Run, type TeamStatus } from "@/lib/spotboard/contest";
import type { SpotboardConfig, SpotboardRun } from "@/lib/spotboard/types";
import { TeamRow } from "./team-row";
import { hsvToRgb } from "./utils";
import "./spotboard.css";

interface SpotboardProps {
	config: SpotboardConfig;
	isAwardMode?: boolean;
}

export function Spotboard({ config, isAwardMode = false }: SpotboardProps) {
	const [logic, setLogic] = useState<ContestLogic | null>(null);
	const [rankedTeams, setRankedTeams] = useState<{ teamId: number; status: TeamStatus }[]>([]);
	const [hiddenRuns, setHiddenRuns] = useState<SpotboardRun[]>([]);

	// Award Ceremony State
	const [finalizedTeams, setFinalizedTeams] = useState<Set<number>>(new Set());
	const [focusedTeamId, setFocusedTeamId] = useState<number | null>(null);

	// Initialize logic
	useEffect(() => {
		const l = new ContestLogic(config.teams, config.problems);

		let initialRuns = config.runs;
		let hidden: SpotboardRun[] = [];

		if (isAwardMode && config.freezeTime) {
			// In award mode:
			// 1. Add runs before freeze time (normal state)
			initialRuns = config.runs.filter((r) => r.time < config.freezeTime!);

			// 2. Store frozen runs as hidden (will be revealed one by one)
			hidden = config.runs.filter((r) => r.time >= config.freezeTime!);

			// 3. CRITICAL: Add frozen runs as PENDING state to mask them
			const frozenRunsAsPending = hidden.map((r) => ({
				...r,
				result: "Pending", // Mask the actual result
			}));

			// Add pending runs to initial state
			initialRuns = [...initialRuns, ...frozenRunsAsPending];
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
					run.anigmaDetails
				)
			);
		}

		setLogic(l);
		setRankedTeams(l.getRankedTeams());
		setHiddenRuns(hidden);
		setFinalizedTeams(new Set());
		setFocusedTeamId(null);
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

	// Award ceremony step (ICPC Style)
	const revealNext = useCallback(() => {
		if (!logic) return;

		// 1. If we have a focused team, continue processing it
		if (focusedTeamId !== null) {
			const teamStatus = logic.teamStatuses.get(focusedTeamId);
			if (!teamStatus) return;

			// Find pending problems (problems with hidden runs)
			const pendingProblems: number[] = [];
			for (const [problemId, _pStatus] of teamStatus.problemStatuses) {
				const hasHidden = hiddenRuns.some(
					(r) => r.teamId === focusedTeamId && r.problemId === problemId
				);
				if (hasHidden) {
					pendingProblems.push(problemId);
				}
			}

			if (pendingProblems.length > 0) {
				const nextProblemId = pendingProblems[0];

				// Get all hidden runs for this problem
				const problemRuns = hiddenRuns
					.filter((r) => r.teamId === focusedTeamId && r.problemId === nextProblemId)
					.sort((a, b) => a.time - b.time);

				// Reveal all runs for this ONE problem
				for (const run of problemRuns) {
					const runToAdd = new Run(
						run.id,
						run.teamId,
						run.problemId,
						run.time,
						run.result,
						run.score,
						run.problemType,
						run.anigmaDetails
					);
					logic.addRun(runToAdd);
				}

				// Remove revealed runs from hidden
				setHiddenRuns((prev) =>
					prev.filter((r) => !(r.teamId === focusedTeamId && r.problemId === nextProblemId))
				);
				updateRankings();
			} else {
				// No more pending problems for this team -> Finalize
				setFinalizedTeams((prev) => {
					const next = new Set(prev);
					next.add(focusedTeamId);
					return next;
				});
				setFocusedTeamId(null);
			}
			return;
		}

		// 2. No focused team -> Find the lowest ranked non-finalized team
		const currentStandings = logic.getRankedTeams();
		let targetTeamId: number | null = null;

		for (let i = currentStandings.length - 1; i >= 0; i--) {
			if (!finalizedTeams.has(currentStandings[i].teamId)) {
				targetTeamId = currentStandings[i].teamId;
				break;
			}
		}

		if (targetTeamId !== null) {
			setFocusedTeamId(targetTeamId);
		}
	}, [logic, hiddenRuns, focusedTeamId, finalizedTeams, updateRankings]);

	useEffect(() => {
		if (!isAwardMode) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight" || e.key === "Enter") {
				revealNext();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isAwardMode, revealNext]);

	if (!logic) return <div>Loading Spotboard...</div>;

	return (
		<div className="spotboard-container">
			<div id="header">
				<div id="contest-title">
					{config.contestTitle}
					{hiddenRuns.length > 0 && <span className="text-yellow-600 ml-2">(Frozen)</span>}
				</div>
				<div id="system-information">
					{config.systemName} {config.systemVersion}
				</div>
			</div>

			<div id="wrapper">
				<div id="team-list" style={{ height: `${rankedTeams.length * 2.0}em` }}>
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
								rankedTeams={rankedTeams}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}
