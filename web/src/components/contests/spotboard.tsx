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

// Format seconds to MM:SS
function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// HSV to RGB conversion (from original spotboard)
function hsvToRgb(h: number, s: number, v: number): string {
	let r: number, g: number, b: number;
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	switch (i % 6) {
		case 0:
			r = v;
			g = t;
			b = p;
			break;
		case 1:
			r = q;
			g = v;
			b = p;
			break;
		case 2:
			r = p;
			g = v;
			b = t;
			break;
		case 3:
			r = p;
			g = q;
			b = v;
			break;
		case 4:
			r = t;
			g = p;
			b = v;
			break;
		case 5:
			r = v;
			g = p;
			b = q;
			break;
		default:
			r = 0;
			g = 0;
			b = 0;
	}
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

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
			// This is what original spotboard does - all frozen runs appear as "?"
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
			css += `.problem-result.problem-${prob.id} b:before { content: "${prob.title}"; }\n`;
		});

		// Add solved-count background colors for each solved level
		// Original spotboard uses HSV gradient from red to green
		const solvedLevels = config.problems.length + 1;
		for (let i = 0; i <= solvedLevels; i++) {
			const ratio = i / solvedLevels;
			// HSV gradient: H from -2/360 to 105/360, S=0.96, V=0.31
			const h = (-2 / 360) * (1 - ratio) + (105 / 360) * ratio;
			let s = 0.96;
			let v = 0.31;

			// Alternate shading for better visibility
			if (i % 2 === 1) {
				s = Math.max(s - 0.15, 0);
				v = Math.min(v + 0.1, 1);
			}

			const rgb = hsvToRgb(h, s, v);
			css += `.solved-${i} .solved-count { background-color: ${rgb}; }\n`;
		}

		style.textContent = css;
	}, [config]);

	// Award ceremony step (ICPC Style)
	const revealNext = useCallback(() => {
		if (!logic) return;

		// 1. If we have a focused team, continue processing it
		if (focusedTeamId !== null) {
			// Get all pending problems for this team (problems that still show "?")
			const teamStatus = logic.teamStatuses.get(focusedTeamId);
			if (!teamStatus) return;

			// Find pending problems (problems with hidden runs)
			const pendingProblems: number[] = [];
			for (const [problemId, pStatus] of teamStatus.problemStatuses) {
				// Check if this problem has hidden runs
				const hasHidden = hiddenRuns.some(
					(r) => r.teamId === focusedTeamId && r.problemId === problemId
				);
				if (hasHidden) {
					pendingProblems.push(problemId);
				}
			}

			if (pendingProblems.length > 0) {
				// Reveal ONE problem (all runs for that problem)
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
				<div id="team-list" style={{ height: `${rankedTeams.length * 2.0}em` }}>
					{rankedTeams.map((item, index) => {
						const team = config.teams.find((t) => t.id === item.teamId);
						if (!team) return null;

						const status = item.status;
						const solved = status.getTotalSolved();
						const penalty = status.getTotalPenalty();
						const rank = status.rank;

						// Check if contest has anigma problems
						const hasAnigma = config.problems.some((p) => p.problemType === "anigma");
						const totalScore = hasAnigma ? status.getTotalScore() : null;
						const maxSolvedTime = hasAnigma ? status.getLastSolvedTime() : null;

						const isFinalized = finalizedTeams.has(team.id);
						const isFocused = focusedTeamId === team.id;

						// Calculate suffix
						const suffix = ["th", "st", "nd", "rd"][
							rank % 100 > 10 && rank % 100 < 20 ? 0 : rank % 10 < 4 ? rank % 10 : 0
						];

						// Check if this is first/last team with this solved count (for solved-count display)
						let solvedCountClass = "";
						if (index === 0 || rankedTeams[index - 1].status.getTotalSolved() !== solved) {
							solvedCountClass = "first";
						}
						if (
							index === rankedTeams.length - 1 ||
							rankedTeams[index + 1].status.getTotalSolved() !== solved
						) {
							solvedCountClass += solvedCountClass ? " last" : "last";
						}

						return (
							<div
								key={team.id}
								className={`team solved-${solved} ${isFinalized ? "finalized" : ""} ${isFocused ? "target" : ""}`}
								style={{
									top: `${index * 2.0}em`, // 2.0em height per row - no gap
								}}
							>
								<div className={`solved-count ${solvedCountClass}`}>{solved}</div>
								<div className={`team-rank suffix-${suffix}`}>{rank}</div>

								{/* Score and Penalty must come BEFORE results for float: right to work correctly */}
								{hasAnigma && totalScore !== null && (
									<div className="team-score">{totalScore}</div>
								)}
								<div className="team-penalty">
									{hasAnigma && maxSolvedTime !== null ?
										Math.floor(maxSolvedTime / 60)
										: Math.floor(penalty / 60)
									}
								</div>

								<div className="results">
									{config.problems.map((prob) => {
										const pStatus = status.getProblemStatus(prob.id, prob.problemType);
										const isAccepted = pStatus.isAccepted();
										const isPending = pStatus.isPending();
										const isFailed = pStatus.isFailed();
										// 문제 타입을 prob에서 직접 확인
										const isAnigma = prob.problemType === "anigma";

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

										// ANIGMA 점수 또는 ICPC 시도 횟수 표시
										let resultText = "";
										let resultScore: number | null = null;
										let isAnigmaResult = false;
										let tooltipText = "";

										if (isAnigma) {
											// ANIGMA: 점수 표시 + "pt" 단위
											if (isAccepted) {
												resultScore = pStatus.getBestScore();
												isAnigmaResult = true;
											} else if (isPending || hasHidden) {
												resultText = "?";
											} else if (pStatus.getBestScore() > 0) {
												// 틀렸지만 부분 점수가 있는 경우
												resultScore = pStatus.getBestScore();
												isAnigmaResult = true;
											}

											// ANIGMA tooltip: 상세 정보 생성
											if (resultScore !== null) {
												const runs = pStatus.runs;
												const attempts = runs.length;
												const solvedTime = pStatus.getSolvedTime();

												tooltipText = `점수: ${resultScore}점\n`;
												tooltipText += `시도: ${attempts}회\n`;
												if (solvedTime) {
													tooltipText += `제출: ${formatTime(solvedTime)}`;
												}
											}
										} else {
											// ICPC: 시도 횟수 표시
											if (isAccepted) {
												resultText =
													pStatus.getFailedAttempts() > 0 ? `+${pStatus.getFailedAttempts()}` : "+";

												// ICPC tooltip
												const solvedTime = pStatus.getSolvedTime();
												const failedAttempts = pStatus.getFailedAttempts();
												tooltipText = `정답!\n`;
												if (failedAttempts > 0) {
													tooltipText += `오답 횟수: ${failedAttempts}회\n`;
												}
												if (solvedTime !== null) {
													tooltipText += `해결 시간: ${solvedTime}분`;
												}
											} else if (isFailed) {
												resultText = `-${pStatus.getFailedAttempts()}`;
												tooltipText = `오답 횟수: ${pStatus.getFailedAttempts()}회`;
											} else if (isPending || hasHidden) {
												resultText = "?";
												tooltipText = "결과 대기중";
											}
										}

										// 점수 범위에 따른 색상 클래스 추가 (정답인 경우만)
										let scoreClass = "";
										if (resultScore !== null && isAnigma && isAccepted) {
											if (resultScore < 80) {
												scoreClass = "score-low";
											} else if (resultScore == 100) {
												scoreClass = "score-high";
											} else {
												scoreClass = "score-medium";
											}
										}

										return (
											<div
												key={prob.id}
												className={`${className} problem-${prob.id} ${isAnigmaResult ? "anigma-result" : ""} ${scoreClass}`}
												title={tooltipText}
											>
												<div className="problem-result-text">
													<b>
														{resultScore !== null && resultScore < 100 ? (
															<>
																{resultScore}
																<span className="score-unit">pt</span>
															</>
														) : (
															resultText
														)}
													</b>
												</div>
											</div>
										);
									})}
								</div>

								<div className="team-name" style={{ float: "left", width: "300px" }}>
									<div className="team-title">{team.name}</div>
									{/* <div className="team-represents">{team.group}</div> */}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
