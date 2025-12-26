/*
 * Based on Spotboard (https://github.com/spotboard/spotboard)
 * Copyright (c) Spotboard (Jongwook Choi, Wonha Ryu)
 * Licensed under the MIT License
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { ContestLogic, Run, type TeamStatus } from "@/lib/spotboard/contest";
import type { SpotboardConfig, SpotboardRun } from "@/lib/spotboard/types";
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
			// In award mode, we start with runs before freeze time
			initialRuns = config.runs.filter((r) => r.time < config.freezeTime!);
			hidden = config.runs.filter((r) => r.time >= config.freezeTime!);
		}

		for (const run of initialRuns) {
			l.addRun(
				new Run(run.id, run.teamId, run.problemId, run.time, run.result, run.score, run.problemType)
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

	// Award ceremony step (ICPC Style)
	const revealNext = useCallback(() => {
		if (!logic) return;

		// 1. If we have a focused team, continue processing it
		if (focusedTeamId !== null) {
			// Check if this team has hidden runs
			const teamRuns = hiddenRuns
				.filter((r) => r.teamId === focusedTeamId)
				.sort((a, b) => a.time - b.time);

			if (teamRuns.length > 0) {
				// Reveal ONE run
				const nextRun = teamRuns[0];
				const runToAdd = new Run(
					nextRun.id,
					nextRun.teamId,
					nextRun.problemId,
					nextRun.time,
					nextRun.result,
					nextRun.score,
					nextRun.problemType
				);
				logic.addRun(runToAdd);
				setHiddenRuns((prev) => prev.filter((r) => r.id !== nextRun.id));
				updateRankings();
			} else {
				// No more runs for this team -> Finalize
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

		// Iterate from bottom up
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
				<div id="team-list" style={{ height: `${rankedTeams.length * 2.5}em` }}>
					{rankedTeams.map((item, index) => {
						const team = config.teams.find((t) => t.id === item.teamId);
						if (!team) return null;

						const status = item.status;
						const solved = status.getTotalSolved();
						const penalty = status.getTotalPenalty();
						const rank = status.rank;

						const isFinalized = finalizedTeams.has(team.id);
						const isFocused = focusedTeamId === team.id;

						// Calculate suffix
						const suffix = ["th", "st", "nd", "rd"][
							rank % 100 > 10 && rank % 100 < 20 ? 0 : rank % 10 < 4 ? rank % 10 : 0
						];

						return (
							<div
								key={team.id}
								className={`team solved-${solved} ${isFinalized ? "finalized" : ""} ${isFocused ? "target" : ""}`}
								style={{
									top: `${index * 2.5}em`, // 2.5em height per row
								}}
							>
								<div className={`team-rank suffix-${suffix}`}>{rank}</div>
								<div className={`solved-count ${solved > 0 ? "" : "text-transparent"}`}>
									{solved}
								</div>
								<div className="team-name" style={{ float: "left", width: "300px" }}>
									<div className="team-title">{team.name}</div>
									<div className="team-represents">{team.group}</div>
								</div>

								<div className="results">
									{config.problems.map((prob) => {
										const pStatus = status.getProblemStatus(prob.id);
										const isAccepted = pStatus.isAccepted();
										const isPending = pStatus.isPending();
										const isFailed = !isAccepted && !isPending && pStatus.getFailedAttempts() > 0;

										let className = "problem-result";
										if (isAccepted) className += " solved";
										else if (isFailed) className += " failed";
										else if (isPending) className += " pending";

										// Check if frozen (has pending runs that are actually hidden runs?)
										const hasHidden = hiddenRuns.some(
											(r) => r.teamId === team.id && r.problemId === prob.id
										);
										if (hasHidden && !isAccepted) {
											className += " pending";
										}

										return (
											<div key={prob.id} className={className}>
												<div className="problem-result-text">
													<b>
														{isAccepted ? "+" : isFailed ? "-" : ""}
														{isAccepted
															? pStatus.getFailedAttempts() > 0
																? pStatus.getFailedAttempts()
																: ""
															: isFailed
																? pStatus.getFailedAttempts()
																: isPending || hasHidden
																	? "?"
																	: ""}
													</b>
												</div>
											</div>
										);
									})}
								</div>

								<div className="team-penalty">{penalty}</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
