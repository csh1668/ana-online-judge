import "server-only";

import type { Verdict } from "@/db/schema";
import { getLatestProgress, registerSSEClient, sendHeartbeat } from "@/lib/sse-manager";

/**
 * SSE 스트림을 빌드해 Response로 반환한다.
 *
 * - verdict가 pending/judging이면 Redis pub/sub 대신 전역 sse-manager에 클라이언트를 등록하고
 *   judge 워커가 notifySubmissionUpdate를 호출할 때까지 열린 상태를 유지한다.
 * - 이미 완료된 제출이면 즉시 complete 이벤트를 보내고 닫는다.
 * - 30초마다 heartbeat를 전송해 프록시/로드밸런서 타임아웃을 방지한다.
 * - 클라이언트 연결 종료(AbortSignal abort) 시 interval과 클라이언트 등록을 정리한다.
 *
 * @param submissionId - 제출 ID
 * @param verdict      - 현재 verdict (pending/judging이면 구독, 그 외 즉시 완료)
 * @param request      - 원본 Request (abort signal 사용)
 */
export function buildSubmissionStream(
	submissionId: number,
	verdict: Verdict,
	request: Request
): Response {
	const isAlreadyComplete = verdict !== "pending" && verdict !== "judging";

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// 이미 완료된 제출: complete 이벤트를 즉시 전송하고 닫는다
			if (isAlreadyComplete) {
				const completeMessage = `event: complete\ndata: ${JSON.stringify({ submissionId })}\n\n`;
				controller.enqueue(encoder.encode(completeMessage));
				setTimeout(() => {
					try {
						controller.close();
					} catch (_error) {
						// Controller might already be closed
					}
				}, 100);
				return;
			}

			// 클라이언트 등록
			const unregister = registerSSEClient(submissionId, controller);

			// 연결 확인 이벤트
			const connectMessage = `event: connected\ndata: ${JSON.stringify({ submissionId })}\n\n`;
			controller.enqueue(encoder.encode(connectMessage));

			// 재접속(페이지 복귀) 시 마지막 진행률을 즉시 전달 — 스냅샷이 없으면
			// 아직 큐 대기 중이라는 뜻이므로 아무것도 보내지 않는다.
			const latestProgress = getLatestProgress(submissionId);
			if (latestProgress !== undefined) {
				const progressMessage = `event: progress\ndata: ${JSON.stringify({ percentage: latestProgress })}\n\n`;
				controller.enqueue(encoder.encode(progressMessage));
			}

			// 30초 heartbeat
			const heartbeatInterval = setInterval(() => {
				try {
					sendHeartbeat({ controller, encoder });
				} catch (error) {
					console.error("Heartbeat failed:", error);
					clearInterval(heartbeatInterval);
					unregister();
				}
			}, 30000);

			// 정리 함수
			const cleanup = () => {
				clearInterval(heartbeatInterval);
				unregister();
			};

			// 클라이언트 연결 종료 처리
			request.signal.addEventListener("abort", () => {
				cleanup();
				try {
					controller.close();
				} catch (_error) {
					// Controller might already be closed
				}
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no", // Disable nginx buffering
		},
	});
}
