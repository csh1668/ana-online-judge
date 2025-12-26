import type { SpotboardProblem, SpotboardTeam } from "./types";

export class Run {
	constructor(
		public id: number,
		public teamId: number,
		public problemId: number,
		public time: number,
		public result: string
	) {}

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
}

export class TeamProblemStatus {
	runs: Run[] = [];

	constructor(public problemId: number) {}

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
}

export class TeamStatus {
	problemStatuses: Map<number, TeamProblemStatus> = new Map();
	rank = 1;

	constructor(public teamId: number) {}

	getProblemStatus(problemId: number): TeamProblemStatus {
		if (!this.problemStatuses.has(problemId)) {
			this.problemStatuses.set(problemId, new TeamProblemStatus(problemId));
		}
		return this.problemStatuses.get(problemId)!;
	}

	update(run: Run) {
		const ps = this.getProblemStatus(run.problemId);
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

	getRankedTeams(): { teamId: number; status: TeamStatus }[] {
		const list = Array.from(this.teamStatuses.entries()).map(([teamId, status]) => ({
			teamId,
			status,
		}));

		list.sort((a, b) => {
			const solvedA = a.status.getTotalSolved();
			const solvedB = b.status.getTotalSolved();
			if (solvedA !== solvedB) return solvedB - solvedA;

			const penA = a.status.getTotalPenalty();
			const penB = b.status.getTotalPenalty();
			if (penA !== penB) return penA - penB;

			// Tie-breaker: Last solved time (ascending)
			return a.status.getLastSolvedTime() - b.status.getLastSolvedTime();
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
