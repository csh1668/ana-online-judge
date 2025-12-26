"use client";

import { useEffect, useState } from "react";
import type { GetScoreboardReturn } from "@/actions/scoreboard";
import { Badge } from "@/components/ui/badge";
import { Scoreboard } from "./scoreboard";

type AwardCeremonyProps = {
	data: GetScoreboardReturn;
};

export function AwardCeremony({ data }: AwardCeremonyProps) {
	const [revealedCount, setRevealedCount] = useState(0);
	const totalParticipants = data.scoreboard.length;

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight") {
				setRevealedCount((prev) => Math.min(prev + 1, totalParticipants));
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [totalParticipants]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Badge variant="default" className="text-sm">
					🏆 시상 모드 - → 키를 눌러 다음 순위를 공개하세요
				</Badge>
				<span className="text-sm text-muted-foreground">
					{revealedCount} / {totalParticipants} 공개됨
				</span>
			</div>

			<Scoreboard data={data} isAwardMode={true} revealedCount={revealedCount} />
		</div>
	);
}
