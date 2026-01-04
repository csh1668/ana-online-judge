/*
 * Based on Spotboard (https://github.com/spotboard/spotboard)
 * Copyright (c) Spotboard (Jongwook Choi, Wonha Ryu)
 * Licensed under the MIT License
 */

import type { SpotboardProblem, SpotboardTeam } from "./types";

export class Run {
	constructor(
		public id: number,
		public teamId: number,
		public problemId: number,
		public time: number,
		public result: string,
		public score?: number, // ANIGMA: 점수
		public problemType?: "icpc" | "special_judge" | "anigma",
		public anigmaDetails?: {
			task1Score: number;
			task2Score: number;
			editDistance: number | null;
		}
	) { }

	isJudgedYes(): boolean {
		return this.result === "Yes" || this.result === "accepted";
	}

	isAccepted(): boolean {
		return this.isJudgedYes();
	}

	isPending(): boolean {
		return this.result === "Pending" || this.result === "pending";
	}

	isFailed(): boolean {
		return !this.isPending() && !this.isJudgedYes();
	}

	isAnigma(): boolean {
		return this.problemType === "anigma";
	}
}

export class TeamProblemStatus {
	runs: Run[] = [];

	constructor(
		public problemId: number,
		public problemType?: "icpc" | "special_judge" | "anigma"
	) { }

	addRun(run: Run) {
		this.runs.push(run);
		this.runs.sort((a, b) => a.id - b.id);
	}

	getNetRuns(): Run[] {
		const netr: Run[] = [];
		for (const run of this.runs) {
			netr.push(run);
			if (run.isJudgedYes()) break;
		}
		return netr;
	}

	isAccepted(): boolean {
		const runs = this.getNetRuns();
		return runs.length > 0 && runs[runs.length - 1].isJudgedYes();
	}

	isPending(): boolean {
		const runs = this.getNetRuns();
		return runs.length > 0 && runs[runs.length - 1].isPending();
	}

	getFailedAttempts(): number {
		let attempts = 0;
		for (const run of this.getNetRuns()) {
			if (run.isFailed()) attempts++;
		}
		return attempts;
	}

	getSolvedTime(): number | null {
		if (this.isAnigma()) {
			let maxTask1Score = 0;
			let maxTask2EditDistance = Infinity;
			let maxTask1Time = 0;
			let maxTask2Time = 0;

			for (const run of this.runs) {
				if (run.anigmaDetails) {
					if (run.anigmaDetails.task1Score > maxTask1Score) {
						maxTask1Score = run.anigmaDetails.task1Score;
						maxTask1Time = run.time;
					} else if (run.anigmaDetails.task1Score === maxTask1Score) {
						maxTask1Time = Math.min(maxTask1Time, run.time);
					}

					if (run.anigmaDetails.editDistance === null) continue;
					// edit distance가 작아야 점수가 높음
					if (run.anigmaDetails.editDistance < maxTask2EditDistance) {
						maxTask2EditDistance = run.anigmaDetails.editDistance;
						maxTask2Time = run.time;
					} else if (run.anigmaDetails.editDistance === maxTask2EditDistance) {
						maxTask2Time = Math.min(maxTask2Time, run.time);
					}
				}
			}

			if (maxTask1Score > 0 || maxTask2EditDistance > 0) {
				return Math.max(maxTask1Time, maxTask2Time);
			}
			return null;
		}

		// ICPC: 마지막 "Yes" run의 시간 반환
		const runs = this.getNetRuns();
		if (runs.length > 0 && runs[runs.length - 1].isJudgedYes()) {
			return runs[runs.length - 1].time;
		}
		return null;
	}

	getPenalty(): number {
		if (this.isAccepted()) {
			return this.getFailedAttempts() * 20 + (this.getSolvedTime() || 0);
		}
		return 0;
	}

	// ANIGMA: 최고 점수 반환 (모든 runs에서 task1Score 최대값 + task2Score 최대값)
	getBestScore(): number {
		if (!this.isAnigma()) {
			return 0;
		}

		let maxTask1Score = 0;
		let maxTask2Score = 0;

		for (const run of this.runs) {
			if (run.anigmaDetails) {
				maxTask1Score = Math.max(maxTask1Score, run.anigmaDetails.task1Score);
				maxTask2Score = Math.max(maxTask2Score, run.anigmaDetails.task2Score);
			}
		}

		return maxTask1Score + maxTask2Score;
	}

	// ANIGMA 문제인지 확인
	isAnigma(): boolean {
		return this.problemType === "anigma";
	}

	isFailed(): boolean {
		return !this.isPending() && !this.isAccepted() && this.getFailedAttempts() > 0;
	}
}

export class TeamStatus {
	problemStatuses: Map<number, TeamProblemStatus> = new Map();
	rank = 1;

	constructor(public teamId: number) { }

	getProblemStatus(
		problemId: number,
		problemType?: "icpc" | "special_judge" | "anigma"
	): TeamProblemStatus {
		if (!this.problemStatuses.has(problemId)) {
			this.problemStatuses.set(problemId, new TeamProblemStatus(problemId, problemType));
		}
		return this.problemStatuses.get(problemId)!;
	}

	update(run: Run) {
		const ps = this.getProblemStatus(run.problemId, run.problemType);
		ps.addRun(run);
	}

	getTotalSolved(): number {
		let solved = 0;
		for (const ps of this.problemStatuses.values()) {
			if (ps.isAccepted()) solved++;
		}
		return solved;
	}

	getTotalPenalty(): number {
		let penalty = 0;
		for (const ps of this.problemStatuses.values()) {
			penalty += ps.getPenalty();
		}
		return penalty;
	}

	getLastSolvedTime(): number {
		let maxTime = 0;
		for (const ps of this.problemStatuses.values()) {
			const t = ps.getSolvedTime();
			if (t !== null && t > maxTime) maxTime = t;
		}
		return maxTime;
	}

	// ANIGMA: 총 점수 계산
	getTotalScore(): number {
		let total = 0;
		for (const ps of this.problemStatuses.values()) {
			if (ps.problemType === "anigma") {
				total += ps.getBestScore();
			} else {
				// ICPC: 푼 문제당 100점
				if (ps.isAccepted()) {
					total += 100;
				}
			}
		}
		return total;
	}
}

export class ContestLogic {
	teams: Map<number, SpotboardTeam> = new Map();
	problems: Map<number, SpotboardProblem> = new Map();
	teamStatuses: Map<number, TeamStatus> = new Map();
	runs: Run[] = [];

	constructor(teams: SpotboardTeam[], problems: SpotboardProblem[]) {
		for (const t of teams) {
			this.teams.set(t.id, t);
			this.teamStatuses.set(t.id, new TeamStatus(t.id));
		}
		for (const p of problems) {
			this.problems.set(p.id, p);
		}
	}

	addRun(run: Run) {
		this.runs.push(run);
		if (this.teamStatuses.has(run.teamId)) {
			this.teamStatuses.get(run.teamId)!.update(run);
		}
	}

	// Check if contest has any ANIGMA problems
	hasAnigmaProblems(): boolean {
		return Array.from(this.problems.values()).some((p) => p.problemType === "anigma");
	}

	getRankedTeams(): { teamId: number; status: TeamStatus }[] {
		const list = Array.from(this.teamStatuses.entries()).map(([teamId, status]) => ({
			teamId,
			status,
		}));

		const hasAnigma = this.hasAnigmaProblems();

		list.sort((a, b) => {
			if (hasAnigma) {
				// ANIGMA 또는 혼합 대회: 점수 기반 순위
				const scoreA = a.status.getTotalScore();
				const scoreB = b.status.getTotalScore();
				if (scoreA !== scoreB) return scoreB - scoreA;

				// 동점일 경우: 마지막 제출 시간 (빠를수록 높은 순위)
				return a.status.getLastSolvedTime() - b.status.getLastSolvedTime();
			} else {
				// ICPC: 푼 문제 수 우선, 그 다음 패널티
				const solvedA = a.status.getTotalSolved();
				const solvedB = b.status.getTotalSolved();
				if (solvedA !== solvedB) return solvedB - solvedA;

				const penA = a.status.getTotalPenalty();
				const penB = b.status.getTotalPenalty();
				if (penA !== penB) return penA - penB;

				// Tie-breaker: Last solved time (ascending)
				return a.status.getLastSolvedTime() - b.status.getLastSolvedTime();
			}
		});

		// Assign ranks
		for (let i = 0; i < list.length; i++) {
			const item = list[i];
			if (i > 0) {
				const prev = list[i - 1];
				const solvedA = item.status.getTotalSolved();
				const solvedB = prev.status.getTotalSolved();
				const penA = item.status.getTotalPenalty();
				const penB = prev.status.getTotalPenalty();

				if (solvedA === solvedB && penA === penB) {
					item.status.rank = prev.status.rank;
				} else {
					item.status.rank = i + 1;
				}
			} else {
				item.status.rank = 1;
			}
		}

		return list;
	}
}
