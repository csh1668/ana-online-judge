"use server";

import * as judgeStatus from "@/lib/services/judge-status";

// 인증 불요 — 채점 서버 가동 여부/큐 깊이만 노출하는 공개 상태 페이지용 액션.
export async function getJudgeQueueStatus() {
	return judgeStatus.getJudgeQueueStatus();
}
