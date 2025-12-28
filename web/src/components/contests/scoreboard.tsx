"use client";

import type { GetScoreboardReturn } from "@/actions/scoreboard";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { AnigmaScoreBreakdown } from "./anigma-score-breakdown";

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

	// In award mode, only show revealed entries from the bottom
	const displayedScoreboard = isAwardMode ? scoreboard.slice(-revealedCount) : scoreboard;

	return (
		<div className="space-y-4">
			{isFrozen && (
				<Badge variant="secondary" className="text-sm">
					🧊 스코어보드가 프리즈되었습니다
				</Badge>
			)}

			<div className="rounded-md border overflow-x-auto">
				<Table>
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
										<div>
											<div className="font-medium">{entry.name}</div>
											<div className="text-sm text-muted-foreground">{entry.username}</div>
										</div>
									</TableCell>
									<TableCell className="text-right font-bold">{entry.totalScore}</TableCell>
									<TableCell className="text-right text-muted-foreground">
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
												) : problem.solved ? (
													// ICPC: show solved with attempts
													<span className="text-green-600 font-medium">
														+{problem.attempts! > 1 ? problem.attempts! - 1 : ""}
													</span>
												) : problem.attempts ? (
													// ICPC: show failed attempts
													<span className="text-red-600">-{problem.attempts}</span>
												) : (
													// No attempts
													<span className="text-muted-foreground">-</span>
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
		</div>
	);
}
