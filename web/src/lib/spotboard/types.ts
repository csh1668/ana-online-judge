export interface SpotboardRun {
	id: number;
	teamId: number;
	problemId: number;
	result: string; // "Yes", "No", "Pending"
	time: number; // minutes
}

export interface SpotboardTeam {
	id: number;
	name: string;
	group?: string;
}

export interface SpotboardProblem {
	id: number;
	title: string;
	color?: string;
}

export interface SpotboardConfig {
	contestTitle: string;
	systemName: string;
	systemVersion: string;
	problems: SpotboardProblem[];
	teams: SpotboardTeam[];
	runs: SpotboardRun[];
	freezeTime?: number; // minutes from start
}
