"use client";

import { ChevronsRight, Circle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getJudgeQueueStatus } from "@/actions/judge-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format-date";
import { JUDGE_PRIORITY_LABELS, JUDGE_PRIORITY_LEVELS } from "@/lib/judge-priority";
import type { JudgeQueueStatus } from "@/lib/services/judge-status";

const POLL_INTERVAL_MS = 5000;
// 워커가 전부 꺼져 있으면 실제 개수를 알 수 없으므로 배포 기본값(compose JUDGE_WORKER_PROCS=5)만큼
// 빨간 사각형을 표시한다.
const OFFLINE_WORKER_PLACEHOLDER = 5;
// 우선순위 그룹당 최대 표시 사각형 수 — 초과분은 "+N"으로 축약
const MAX_SQUARES_PER_GROUP = 20;
// 새로고침(자동/수동 공통) 시 스피너가 눈에 보이도록 하는 최소 회전 시간
const MIN_SPIN_MS = 400;

/** 시각 확인용 목 모드 — ?mock=true(가동 중) / ?mock=off(꺼짐). 실데이터 없이 UI를 검증한다. */
export type MockMode = "online" | "offline" | null;

/**
 * 목 데이터 생성. 초기 렌더(randomize=false)는 SSR과 hydration 결과가 일치해야
 * 하므로 결정적 값만 쓰고, 새로고침(randomize=true) 때만 값을 흔들어
 * 갱신이 실제로 일어남을 보여준다.
 */
function generateMockStatus(mode: Exclude<MockMode, null>, randomize: boolean): JudgeQueueStatus {
	const checkedAt = new Date().toISOString();
	if (mode === "offline") {
		return {
			online: false,
			workersOnline: 0,
			workers: [],
			inFlight: 0,
			queuedByPriority: Object.fromEntries(JUDGE_PRIORITY_LEVELS.map((p) => [String(p), 0])),
			queuedTotal: 0,
			deadLetters: 0,
			checkedAt,
		};
	}

	const workers = randomize
		? Array.from({ length: 5 }, (_, id) => ({ id, busy: Math.random() < 0.6 }))
		: [true, false, true, true, false].map((busy, id) => ({ id, busy }));
	const queuedByPriority: Record<string, number> = {
		"2": randomize ? 2 + Math.floor(Math.random() * 3) : 3,
		"1": 0,
		"0": randomize ? 10 + Math.floor(Math.random() * 8) : 14,
		"-1": 0,
		"-2": randomize ? 22 + Math.floor(Math.random() * 10) : 27,
	};
	const queuedTotal = Object.values(queuedByPriority).reduce((s, v) => s + v, 0);
	return {
		online: true,
		workersOnline: workers.length,
		workers,
		inFlight: workers.filter((w) => w.busy).length,
		queuedByPriority,
		queuedTotal,
		deadLetters: 0,
		checkedAt,
	};
}

function MetricCard({ label, value }: { label: string; value: number }) {
	return (
		<Card>
			<CardContent className="space-y-1">
				<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
				<p className="font-mulmaru text-4xl font-extrabold leading-none tracking-tight text-primary">
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

/** 워커 1대 = 가로로 긴 바 1개. 유휴=초록, 채점 중=주황, (오프라인 표시는 부모에서 빨강으로 렌더) */
function WorkerBox({ id, busy }: { id: number; busy: boolean }) {
	const tone = busy
		? "border-[var(--verdict-tle)] bg-[var(--verdict-tle-bg)] text-[var(--verdict-tle)] animate-pulse"
		: "border-[var(--verdict-accepted)] bg-[var(--verdict-accepted-bg)] text-[var(--verdict-accepted)]";
	return (
		<div
			title={busy ? `워커 #${id} — 채점 중` : `워커 #${id} — 대기 (유휴)`}
			className={`flex h-10 w-36 items-center justify-between rounded-[2px] border-[1.5px] px-3 font-mono ${tone}`}
		>
			<span className="text-sm font-bold">#{id}</span>
			<span className="text-[11px]">{busy ? "채점 중" : "유휴"}</span>
		</div>
	);
}

function OfflineWorkerBox({ index }: { index: number }) {
	return (
		<div
			title="채점 서버가 꺼져 있습니다"
			className="flex h-10 w-36 items-center justify-between rounded-[2px] border-[1.5px] border-[var(--verdict-wrong)] bg-[var(--verdict-wrong-bg)] px-3 font-mono text-[var(--verdict-wrong)]"
		>
			<span className="text-sm font-bold">#{index}</span>
			<span className="text-[11px]">꺼짐</span>
		</div>
	);
}

/** 우선순위 그룹 — 상단 ┌(라벨)┐ 범위 표시 + 대기 작업 사각형들 */
function WaitingGroup({ level, count }: { level: number; count: number }) {
	const shown = Math.min(count, MAX_SQUARES_PER_GROUP);
	const overflow = count - shown;
	return (
		<div className="flex flex-col gap-1.5">
			{/* 그룹 폭이 라벨보다 좁으면 라벨이 두 줄로 꺾여 높이가 어긋난다 — 줄바꿈 금지 */}
			<p className="whitespace-nowrap text-center font-mono text-xs leading-none text-muted-foreground">
				{JUDGE_PRIORITY_LABELS[level as keyof typeof JUDGE_PRIORITY_LABELS] ?? level}
			</p>
			<div className="h-[6px] rounded-t-[2px] border-x border-t border-border" />
			<div className="flex max-w-[264px] flex-wrap items-center gap-1.5">
				{Array.from({ length: shown }, (_, i) => (
					<div
						// 대기 사각형은 상태가 없는 균질한 표식이라 index key로 충분
						// biome-ignore lint/suspicious/noArrayIndexKey: homogeneous placeholder squares
						key={i}
						className="h-5 w-5 rounded-[2px] border border-[var(--verdict-pending)] bg-[var(--verdict-pending-bg)]"
					/>
				))}
				{overflow > 0 && (
					<span className="font-mono text-xs text-muted-foreground">+{overflow}</span>
				)}
			</div>
		</div>
	);
}

export function StatusClient({
	initialStatus,
	mockMode = null,
}: {
	initialStatus: JudgeQueueStatus | null;
	mockMode?: MockMode;
}) {
	const [status, setStatus] = useState<JudgeQueueStatus>(
		() => initialStatus ?? generateMockStatus(mockMode ?? "online", false)
	);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const mountedRef = useRef(true);

	const refresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			const [next] = await Promise.all([
				mockMode ? Promise.resolve(generateMockStatus(mockMode, true)) : getJudgeQueueStatus(),
				new Promise((r) => setTimeout(r, MIN_SPIN_MS)),
			]);
			if (mountedRef.current) setStatus(next);
		} catch (e) {
			console.error("[status] refresh failed:", e);
		} finally {
			if (mountedRef.current) setIsRefreshing(false);
		}
	}, [mockMode]);

	useEffect(() => {
		mountedRef.current = true;
		const timer = setInterval(refresh, POLL_INTERVAL_MS);
		return () => {
			mountedRef.current = false;
			clearInterval(timer);
		};
	}, [refresh]);

	// 좌→우 = 낮은 우선순위→높은 우선순위 (워커에 가까운 쪽이 먼저 소비됨)
	const waitingGroups = [...JUDGE_PRIORITY_LEVELS]
		.map((level) => ({ level, count: status.queuedByPriority[String(level)] ?? 0 }))
		.filter((entry) => entry.count > 0);

	const checkedAtLabel = formatTime(status.checkedAt);

	return (
		<div className="space-y-4">
			<Alert
				variant={status.online ? "default" : "destructive"}
				className={
					status.online
						? "flex items-center justify-between border-l-[var(--verdict-accepted)]"
						: "flex items-center justify-between"
				}
			>
				<div
					className={`flex items-center gap-2 font-medium ${
						status.online ? "text-[var(--verdict-accepted)]" : ""
					}`}
				>
					<Circle className="h-4 w-4 fill-current" />
					{status.online ? "채점 서버 정상 가동 중" : "채점 서버가 꺼져 있습니다"}
					{mockMode && (
						<span className="rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
							Mock
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5 text-muted-foreground">
					{/* 목 모드의 초기 checkedAt은 SSR/클라이언트 시각이 밀리초 단위로 다를 수 있음 */}
					<span className="font-mono text-xs" suppressHydrationWarning>
						마지막 갱신 {checkedAtLabel}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						aria-label="새로고침"
						disabled={isRefreshing}
						onClick={refresh}
					>
						<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
					</Button>
				</div>
			</Alert>

			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="가동 워커" value={status.workersOnline} />
				<MetricCard label="채점 중" value={status.inFlight} />
				<MetricCard label="대기 중 (전체)" value={status.queuedTotal} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>채점 큐 현황</CardTitle>
				</CardHeader>
				<CardContent>
					{/* 전체 폭을 쓰면 FHD에서 중간 공백이 과도해지므로 중앙 제한 폭 안에 배치 */}
					<div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-8">
						{/* 좌: 대기 중인 작업 — 좌측부터 배치, 그룹 상단(라벨 높이) 정렬.
						    좌→우 = 낮은→높은 우선순위 (워커에 가까운 쪽이 먼저 소비됨) */}
						<div className="flex flex-1 items-start justify-start gap-5 overflow-x-auto">
							{waitingGroups.length === 0 ? (
								<p className="mx-auto self-center text-sm text-muted-foreground">
									대기 중인 작업이 없습니다
								</p>
							) : (
								waitingGroups.map(({ level, count }) => (
									<WaitingGroup key={level} level={level} count={count} />
								))
							)}
						</div>

						<ChevronsRight className="h-6 w-6 shrink-0 text-muted-foreground" />

						{/* 우: 워커들 (수직 배치) */}
						<div className="flex shrink-0 flex-col gap-2">
							{status.online
								? status.workers.map((w) => <WorkerBox key={w.id} id={w.id} busy={w.busy} />)
								: Array.from({ length: OFFLINE_WORKER_PLACEHOLDER }, (_, i) => (
										// 오프라인 자리표시자는 상태가 없는 균질 표식이라 index key로 충분
										// biome-ignore lint/suspicious/noArrayIndexKey: homogeneous placeholder boxes
										<OfflineWorkerBox key={i} index={i} />
									))}
						</div>
					</div>

					<p className="mt-4 font-mono text-[11px] text-muted-foreground">
						<span className="text-[var(--verdict-accepted)]">■</span> 유휴{"  "}
						<span className="text-[var(--verdict-tle)]">■</span> 채점 중{"  "}
						<span className="text-[var(--verdict-wrong)]">■</span> 꺼짐{"  "}
						<span className="text-[var(--verdict-pending)]">■</span> 대기 작업
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
