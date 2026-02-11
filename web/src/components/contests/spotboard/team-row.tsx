"use client";

import type { TeamStatus } from "@/lib/spotboard/contest";
import type { SpotboardConfig, SpotboardRun } from "@/lib/spotboard/types";
import { formatTime } from "./utils";

interface TeamRowProps {
	team: { id: number; name: string; group?: string };
	status: TeamStatus;
	index: number;
	config: SpotboardConfig;
	hiddenRuns: SpotboardRun[];
	isFinalized: boolean;
	isFocused: boolean;
	rankedTeams: { teamId: number; status: TeamStatus }[];
}

export function TeamRow({
	team,
	status,
	index,
	config,
	hiddenRuns,
	isFinalized,
	isFocused,
	rankedTeams,
}: TeamRowProps) {
	const solved = status.getTotalSolved();
	const penalty = status.getTotalPenalty();
	const rank = status.rank;

	// Check if contest has anigma problems
	const hasAnigma = config.problems.some((p) => p.problemType === "anigma");
	const totalScore = hasAnigma ? status.getTotalScore() : null;
	const maxSolvedTime = hasAnigma ? status.getLastSolvedTime() : null;

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
			className={`team solved-${solved} ${isFinalized ? "finalized" : ""} ${isFocused ? "target" : ""}`}
			style={{
				top: `${index * 2.0}em`, // 2.0em height per row - no gap
			}}
		>
			<div className={`solved-count ${solvedCountClass}`}>{solved}</div>
			<div className={`team-rank suffix-${suffix}`}>{rank}</div>

			{/* Score and Penalty must come BEFORE results for float: right to work correctly */}
			{hasAnigma && totalScore !== null && <div className="team-score">{totalScore}</div>}
			<div className="team-penalty">
				{hasAnigma && maxSolvedTime !== null
					? Math.floor(maxSolvedTime / 60)
					: Math.floor(penalty / 60)}
			</div>

			<div className="results">
				{config.problems.map((prob) => {
					const pStatus = status.getProblemStatus(prob.id, prob.problemType);
					const isAccepted = pStatus.isAccepted();
					const isPending = pStatus.isPending();
					const isFailed = pStatus.isFailed();
					const isAnigma = prob.problemType === "anigma";

					let className = "problem-result";
					if (isAccepted) className += " solved";
					else if (isFailed) className += " failed";
					else if (isPending) className += " pending";

					// Check if frozen (has pending runs that are actually hidden runs?)
					const hasHidden = hiddenRuns.some((r) => r.teamId === team.id && r.problemId === prob.id);
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

							tooltipText = `점수: ${resultScore}점
`;
							tooltipText += `시도: ${attempts}회
`;
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
							tooltipText = `정답!
`;
							if (failedAttempts > 0) {
								tooltipText += `오답 횟수: ${failedAttempts}회
`;
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
						} else if (resultScore === 100) {
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
			</div>
		</div>
	);
}
