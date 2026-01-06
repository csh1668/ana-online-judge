"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { refreshContestScoreboard } from "@/actions/admin";
import { Button } from "@/components/ui/button";

interface RefreshScoreboardButtonProps {
	contestId: number;
}

export function RefreshScoreboardButton({ contestId }: RefreshScoreboardButtonProps) {
	const [isLoading, setIsLoading] = useState(false);

	const handleRefresh = async () => {
		if (
			!confirm(
				"스코어보드를 새로고침하시겠습니까? Anigma 문제의 보너스 점수가 재계산되어 순위가 변경될 수 있습니다."
			)
		) {
			return;
		}

		setIsLoading(true);
		try {
			const result = await refreshContestScoreboard(contestId);

			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.message);
			}
		} catch (error) {
			console.error("Failed to refresh scoreboard:", error);
			toast.error("스코어보드 새로고침에 실패했습니다");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
			<RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
			{isLoading ? "재계산 중..." : "스코어보드 새로고침"}
		</Button>
	);
}
