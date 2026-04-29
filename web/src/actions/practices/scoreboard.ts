"use server";

import * as svc from "@/lib/services/practice-scoreboard";

export async function getPracticeScoreboard(practiceId: number) {
	return svc.getPracticeScoreboard(practiceId);
}

export type GetPracticeScoreboardReturn = Awaited<ReturnType<typeof getPracticeScoreboard>>;
