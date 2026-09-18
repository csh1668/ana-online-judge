"use client";

import { useEffect, useState } from "react";
import type { GetScoreboardReturn } from "@/actions/scoreboard";
import { getScoreboard, getSpotboardData } from "@/actions/scoreboard";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/format-date";
import type { SpotboardConfig } from "@/lib/spotboard/types";
import { AdminScoreboardToolbar } from "./admin-scoreboard-toolbar";
import { AwardCeremony } from "./award-ceremony";
import { Scoreboard } from "./scoreboard";
import { Spotboard } from "./spotboard";

// ICPC 표준: 30초 갱신 (대형 프로젝터 표시용)
const REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

interface ScoreboardPageClientProps {
	contestId: number;
	contestTitle: string;
	isSpotboard: boolean;
	isAwardMode: boolean;
	viewAsParticipant?: boolean;
	initialData: GetScoreboardReturn | SpotboardConfig;
	currentUserId?: number | null;
	isAdmin?: boolean;
	isStaff?: boolean;
}

export function ScoreboardPageClient({
	contestId,
	contestTitle,
	isSpotboard,
	isAwardMode,
	viewAsParticipant = false,
	initialData,
	currentUserId = null,
	isAdmin = false,
	isStaff = false,
}: ScoreboardPageClientProps) {
	const [data, setData] = useState(initialData);
	const [lastUpdate, setLastUpdate] = useState(new Date());
	const [isRefreshing, setIsRefreshing] = useState(false);

	useEffect(() => {
		setData(initialData);
		setLastUpdate(new Date());
	}, [initialData]);

	// Auto-refresh every 30 seconds — but never while in award mode, since a refresh
	// re-initializes the Spotboard and wipes the in-progress reveal (focused team,
	// finalized teams, revealed names, etc.).
	useEffect(() => {
		if (isAwardMode) return;

		const fetchData = async () => {
			try {
				setIsRefreshing(true);
				const newData = isSpotboard
					? await getSpotboardData(contestId, viewAsParticipant)
					: await getScoreboard(contestId, viewAsParticipant);
				setData(newData);
				setLastUpdate(new Date());
			} catch (error) {
				console.error("Failed to refresh scoreboard:", error);
			} finally {
				setIsRefreshing(false);
			}
		};

		const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);

		// Cleanup on unmount
		return () => clearInterval(interval);
	}, [contestId, isSpotboard, isAwardMode, viewAsParticipant]);

	if (isSpotboard) {
		return (
			<div className="w-full min-h-screen bg-white">
				<Spotboard
					config={data as SpotboardConfig}
					isAwardMode={isAwardMode}
					isAdmin={isAdmin}
					lastUpdate={lastUpdate}
					refreshIntervalMs={REFRESH_INTERVAL_MS}
					isRefreshing={isRefreshing}
					adminToolbar={
						isStaff ? (
							<AdminScoreboardToolbar
								isAwardMode={isAwardMode}
								viewAsParticipant={viewAsParticipant}
								className="text-black"
							/>
						) : null
					}
				/>
			</div>
		);
	}

	const scoreboardData = data as GetScoreboardReturn;

	return (
		<div className="w-full h-screen flex flex-col">
			{/* Header */}
			<div className="border-b border-border bg-header text-header-foreground">
				<div className="px-6 py-4 flex items-center justify-between">
					<h1 className="text-2xl font-bold">
						{contestTitle} - 스코어보드
						{scoreboardData.isFrozen && (
							<span className="ml-2 text-base font-medium text-muted-foreground">(Frozen)</span>
						)}
						{isAwardMode && " (시상 모드)"}
					</h1>
					<div className="flex items-center gap-2">
						{isRefreshing && (
							<Badge variant="outline" className="text-xs">
								<span className="animate-spin mr-1">⟳</span>
								갱신 중...
							</Badge>
						)}
						<Badge variant="secondary" className="text-xs">
							마지막 갱신: {formatTime(lastUpdate)}
						</Badge>
						<Badge variant="secondary" className="text-xs">
							30초마다 자동 갱신
						</Badge>
						{isStaff && (
							<AdminScoreboardToolbar
								isAwardMode={isAwardMode}
								viewAsParticipant={viewAsParticipant}
								className="text-header-foreground"
							/>
						)}
					</div>
				</div>
			</div>

			{/* Scoreboard Content */}
			<div className="flex-1 overflow-auto p-6">
				{isAwardMode ? (
					<AwardCeremony data={scoreboardData} currentUserId={currentUserId} isAdmin={isAdmin} />
				) : (
					<Scoreboard data={scoreboardData} currentUserId={currentUserId} isAdmin={isAdmin} />
				)}
			</div>
		</div>
	);
}
