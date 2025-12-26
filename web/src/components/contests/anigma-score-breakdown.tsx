"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AnigmaScoreBreakdownProps {
	task1Score: number;
	task2Score: number;
	editDistance: number | null;
	totalScore: number;
	compact?: boolean;
}

export function AnigmaScoreBreakdown({
	task1Score,
	task2Score,
	editDistance,
	totalScore,
	compact = false,
}: AnigmaScoreBreakdownProps) {
	// Calculate bonus (task2Score should already include bonus from recalculation)
	// Base task2 score is 50 for contest, so bonus = task2Score - 50
	const baseTask2 = 50;
	const bonusScore = task2Score > baseTask2 ? task2Score - baseTask2 : 0;
	const baseTask2Score = task2Score - bonusScore;

	if (compact) {
		// Compact view: show total with tooltip
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="cursor-help">
							<span className="font-bold text-primary">{totalScore}</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-xs">
						<div className="space-y-1 text-xs">
							<div className="flex justify-between gap-4">
								<span className="text-muted-foreground">Task 1:</span>
								<span className="font-medium">{task1Score}점</span>
							</div>
							<div className="flex justify-between gap-4">
								<span className="text-muted-foreground">Task 2 (기본):</span>
								<span className="font-medium">{baseTask2Score}점</span>
							</div>
							{bonusScore > 0 && (
								<div className="flex justify-between gap-4">
									<span className="text-muted-foreground">보너스:</span>
									<span className="font-medium text-green-600">+{bonusScore}점</span>
								</div>
							)}
							{editDistance !== null && (
								<div className="flex justify-between gap-4 pt-1 border-t">
									<span className="text-muted-foreground">편집 거리:</span>
									<span className="font-medium">{editDistance}</span>
								</div>
							)}
							<div className="flex justify-between gap-4 pt-1 border-t font-semibold">
								<span>총점:</span>
								<span>{totalScore}점</span>
							</div>
						</div>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	// Full view: show breakdown with badges
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1 flex-wrap">
				{task1Score > 0 && (
					<Badge variant="secondary" className="text-xs">
						T1: {task1Score}
					</Badge>
				)}
				{baseTask2Score > 0 && (
					<Badge variant="secondary" className="text-xs">
						T2: {baseTask2Score}
					</Badge>
				)}
				{bonusScore > 0 && (
					<Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
						+{bonusScore}
					</Badge>
				)}
			</div>
			<div className="font-bold text-primary">{totalScore}점</div>
			{editDistance !== null && (
				<div className="text-xs text-muted-foreground">편집: {editDistance}</div>
			)}
		</div>
	);
}
