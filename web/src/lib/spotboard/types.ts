export interface SpotboardRun {
	id: number;
	teamId: number;
	problemId: number;
	result: string; // "Yes", "No", "Pending"
	time: number; // seconds from contest start
	score?: number; // ANIGMA: 점수 (0~100)
	problemType?: "icpc" | "special_judge" | "anigma" | "interactive" | "two_step"; // 문제 타입
	anigmaDetails?: {
		task1Score: number;
		task2Score: number;
		editDistance: number | null;
	};
	passedTestcases?: number; // Full-judge: passed testcase count for this submission
}

export interface SpotboardTeam {
	id: number;
	name: string;
	username: string;
	mainExternalSite: "codeforces" | "atcoder" | null;
	mainExternalRating: number | null;
	group?: string;
}

export interface SpotboardProblem {
	id: number;
	title: string;
	color?: string;
	problemType?: "icpc" | "special_judge" | "anigma" | "interactive" | "two_step"; // 문제 타입
}

export interface SpotboardConfig {
	contestTitle: string;
	penaltyMinutes: number;
	problems: SpotboardProblem[];
	teams: SpotboardTeam[];
	runs: SpotboardRun[];
	freezeTime?: number; // seconds from start
	isFrozen?: boolean; // whether the viewer currently sees a frozen scoreboard
	startTime?: number; // contest start, epoch ms (for header countdown)
	endTime?: number; // contest end, epoch ms (for header countdown)
}
