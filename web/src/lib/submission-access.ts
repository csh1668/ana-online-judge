import "server-only";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contests } from "@/db/schema";
import { getSessionInfo } from "@/lib/auth-utils";
import { getContestStatus } from "@/lib/contest-utils";

/**
 * 대회 진행 중인 제출에 대한 접근 권한을 확인한다.
 * - 비대회 제출: 접근 허용 (null 반환)
 * - 대회 종료 후: 접근 허용 (null 반환)
 * - 대회 진행 중: 본인 또는 관리자만 접근 허용, 그 외 403 반환
 */
export async function checkContestSubmissionAccess(submission: {
	userId: number;
	contestId: number | null;
}): Promise<NextResponse | null> {
	if (!submission.contestId) return null;

	const [contest] = await db
		.select({ startTime: contests.startTime, endTime: contests.endTime })
		.from(contests)
		.where(eq(contests.id, submission.contestId))
		.limit(1);

	if (!contest) return null;

	const status = getContestStatus(contest);
	if (status !== "running") return null;

	const { userId, isAdmin } = await getSessionInfo();
	if (isAdmin || userId === submission.userId) return null;

	return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
