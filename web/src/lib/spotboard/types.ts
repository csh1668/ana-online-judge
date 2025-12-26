export interface SpotboardRun {
	id: number;
	teamId: number;
	problemId: number;
	result: string; // "Yes", "No", "Pending"
	time: number; // minutes
	score?: number; // ANIGMA: 점수 (0~100)
	problemType?: "icpc" | "special_judge" | "anigma"; // 문제 타입
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
	problemType?: "icpc" | "special_judge" | "anigma"; // 문제 타입
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
