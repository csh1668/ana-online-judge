"use client";

// 동적 문제 컬럼(problemLabels 개수에 따라 열 수가 변함) 때문에 표 컬럼 폭 규칙(가변 컬럼 1개 +
// 나머지 고정 w-[Npx])이 적용되지 않는다. min-width는 문제 수에 비례해 계산하며 그대로 유지한다.
import type { GetScoreboardReturn, ScoreboardEntry } from "@/actions/scoreboard";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { UserNameDisplay } from "@/components/user-name-display";
import { AnigmaScoreBreakdown } from "./anigma-score-breakdown";

type ProblemEntry = ScoreboardEntry["problems"][string];

function formatSolveTime(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h}:${String(m).padStart(2, "0")}`;
}

function IcpcCell({ problem, isFirstSolver }: { problem: ProblemEntry; isFirstSolver?: boolean }) {
	const showFullJudgeProgress =
		problem.useFullJudge &&
		problem.bestPassed !== undefined &&
		problem.bestPassed > 0 &&
		!!problem.totalTestcases;

	if (!problem.solved && !problem.attempts) {
		// Full-judge: even with no logged attempts, surface bestPassed if any (defensive — usually
		// implies attempts > 0, but the cell renders cleanly either way).
		if (showFullJudgeProgress) {
			return (
				<div className="inline-flex flex-col items-center justify-center leading-tight">
					<span className="text-xs text-muted-foreground">
						{problem.bestPassed}/{problem.totalTestcases}
					</span>
				</div>
			);
		}
		return <span className="text-muted-foreground">·</span>;
	}
	if (!problem.solved) {
		return (
			<div className="inline-flex flex-col items-center justify-center rounded-[2px] px-2 py-0.5 bg-(--verdict-wrong-bg) leading-tight">
				<span className="font-semibold text-(--verdict-wrong)">−{problem.attempts}</span>
				{showFullJudgeProgress && (
					<span className="text-[11px] font-mono text-(--verdict-wrong)/80">
						{problem.bestPassed}/{problem.totalTestcases}
					</span>
				)}
			</div>
		);
	}
	const wrong = (problem.attempts ?? 1) - 1;
	const time = problem.solvedTime !== undefined ? formatSolveTime(problem.solvedTime) : null;
	const pillBg = isFirstSolver ? "bg-(--verdict-accepted)/20" : "bg-(--verdict-accepted-bg)";
	return (
		<div
			className={`inline-flex flex-col items-center justify-center rounded-[2px] px-2 py-0.5 leading-tight ${pillBg}`}
			title={isFirstSolver ? "최초 해결자" : undefined}
		>
			<span className="font-bold text-(--verdict-accepted)">{wrong === 0 ? "+" : `+${wrong}`}</span>
			{time && <span className="text-[11px] font-mono text-(--verdict-accepted)/80">{time}</span>}
		</div>
	);
}

function SubtaskCell({ problem }: { problem: ProblemEntry }) {
	const score = problem.bestScore ?? 0;
	if (!problem.solved && score === 0 && !problem.attempts) {
		return <span className="text-muted-foreground">·</span>;
	}
	const time = problem.solvedTime !== undefined ? formatSolveTime(problem.solvedTime) : null;
	const tone =
		score >= 100
			? "bg-(--verdict-accepted-bg) text-(--verdict-accepted)"
			: score > 0
				? "bg-(--verdict-partial-bg) text-(--verdict-partial)"
				: "bg-(--verdict-wrong-bg) text-(--verdict-wrong)";
	return (
		<div
			className={`inline-flex flex-col items-center justify-center rounded-[2px] px-2 py-0.5 leading-tight ${tone}`}
		>
			<span className="font-bold">{score}</span>
			{time && <span className="text-[11px] font-mono opacity-80">{time}</span>}
		</div>
	);
}

type ScoreboardProps = {
	data: GetScoreboardReturn;
	isAwardMode?: boolean;
	revealedCount?: number;
	currentUserId?: number | null;
	isAdmin?: boolean;
};

export function Scoreboard({
	data,
	isAwardMode = false,
	revealedCount = 0,
	currentUserId = null,
	isAdmin = false,
}: ScoreboardProps) {
	const { scoreboard, isFrozen } = data;

	// Get problem labels from first entry
	const problemLabels = scoreboard.length > 0 ? Object.keys(scoreboard[0].problems).sort() : [];

	// First solver per problem (ICPC): earliest solvedTime among solved entries.
	// Ties at the same minute all share the highlight.
	const firstSolversByLabel = new Map<string, Set<number>>();
	for (const label of problemLabels) {
		let bestTime = Number.POSITIVE_INFINITY;
		const ids = new Set<number>();
		for (const e of scoreboard) {
			const p = e.problems[label];
			if (p?.problemType === "anigma" || p?.hasSubtasks) continue;
			if (!p?.solved || p.solvedTime === undefined || p.isFrozen) continue;
			if (p.solvedTime < bestTime) {
				bestTime = p.solvedTime;
				ids.clear();
				ids.add(e.userId);
			} else if (p.solvedTime === bestTime) {
				ids.add(e.userId);
			}
		}
		if (ids.size > 0) firstSolversByLabel.set(label, ids);
	}

	// In award mode, only show revealed entries from the bottom
	const displayedScoreboard = isAwardMode ? scoreboard.slice(-revealedCount) : scoreboard;

	return (
		<div className="space-y-4">
			{isFrozen && (
				<Badge variant="secondary" className="text-sm">
					🧊 스코어보드가 프리즈되었습니다
				</Badge>
			)}

			<Table style={{ minWidth: `${370 + 80 * problemLabels.length}px` }}>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[60px] text-center">순위</TableHead>
						<TableHead className="w-[150px]">참가자</TableHead>
						<TableHead className="w-[80px] text-right">점수</TableHead>
						<TableHead className="w-[80px] text-right">패널티</TableHead>
						{problemLabels.map((label) => (
							<TableHead key={label} className="w-[80px] text-center">
								{label}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{displayedScoreboard.length === 0 ? (
						<TableRow>
							<TableCell colSpan={4 + problemLabels.length} className="text-center py-12">
								참가자가 없습니다.
							</TableCell>
						</TableRow>
					) : (
						displayedScoreboard.map((entry) => (
							<TableRow key={entry.userId}>
								<TableCell className="text-center font-bold">{entry.rank}</TableCell>
								<TableCell>
									<div className="font-medium truncate" title={entry.name}>
										<UserNameDisplay
											user={{
												name: entry.name,
												username: entry.username,
												mainExternalSite: entry.mainExternalSite,
												mainExternalRating: entry.mainExternalRating,
											}}
											withLink
										/>
									</div>
								</TableCell>
								<TableCell className="text-right tabular-nums font-bold">
									{entry.totalScore}
								</TableCell>
								<TableCell className="text-right tabular-nums text-muted-foreground">
									{entry.penalty}
								</TableCell>
								{problemLabels.map((label) => {
									const problem = entry.problems[label];
									return (
										<TableCell key={label} className="text-center">
											{problem.isFrozen ? (
												<span className="text-muted-foreground">?</span>
											) : problem.problemType === "anigma" ? (
												// ANIGMA: show score breakdown
												problem.anigmaDetails ? (
													<AnigmaScoreBreakdown
														task1Score={problem.anigmaDetails.task1Score}
														task2Score={problem.anigmaDetails.task2Score}
														editDistance={problem.anigmaDetails.editDistance}
														totalScore={problem.score || 0}
														compact
														canViewEditDistance={
															isAdmin || (currentUserId !== null && entry.userId === currentUserId)
														}
													/>
												) : (
													<span className="font-bold text-primary">{problem.score || 0}</span>
												)
											) : problem.hasSubtasks ? (
												<SubtaskCell problem={problem} />
											) : (
												<IcpcCell
													problem={problem}
													isFirstSolver={firstSolversByLabel.get(label)?.has(entry.userId)}
												/>
											)}
										</TableCell>
									);
								})}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
