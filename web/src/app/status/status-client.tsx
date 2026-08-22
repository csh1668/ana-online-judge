"use client";

import { Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { getJudgeQueueStatus } from "@/actions/judge-status";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JUDGE_PRIORITY_LABELS, JUDGE_PRIORITY_LEVELS } from "@/lib/judge-priority";
import type { JudgeQueueStatus } from "@/lib/services/judge-status";

const POLL_INTERVAL_MS = 5000;
// 표시 순서는 우선순위 높은 순 (+2 → -2)
const PRIORITY_LEVELS_DESC = [...JUDGE_PRIORITY_LEVELS].reverse();

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

export function StatusClient({ initialStatus }: { initialStatus: JudgeQueueStatus }) {
	const [status, setStatus] = useState(initialStatus);

	useEffect(() => {
		let cancelled = false;
		const timer = setInterval(async () => {
			try {
				const next = await getJudgeQueueStatus();
				if (!cancelled) setStatus(next);
			} catch (e) {
				console.error("[status] poll failed:", e);
			}
		}, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, []);

	const visibleLevels = PRIORITY_LEVELS_DESC.map((level) => ({
		level,
		count: status.queuedByPriority[String(level)] ?? 0,
	})).filter((entry) => entry.count > 0);

	const checkedAtLabel = new Date(status.checkedAt).toLocaleTimeString("ko-KR", { hour12: false });

	return (
		<div className="space-y-4">
			<Alert
				variant={status.online ? "default" : "destructive"}
				className={
					status.online
						? "border-l-[var(--verdict-accepted)] text-[var(--verdict-accepted)]"
						: undefined
				}
			>
				<Circle className="fill-current" />
				<AlertTitle>
					{status.online ? "채점 서버 정상 가동 중" : "채점 서버가 꺼져 있습니다"}
				</AlertTitle>
			</Alert>

			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="가동 워커" value={status.workersOnline} />
				<MetricCard label="채점 중" value={status.inFlight} />
				<MetricCard label="대기 중 (전체)" value={status.queuedTotal} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">대기 상세 (우선순위별)</CardTitle>
				</CardHeader>
				<CardContent>
					{visibleLevels.length === 0 ? (
						<p className="text-sm text-muted-foreground">대기 중인 작업이 없습니다.</p>
					) : (
						<ul className="rounded-[2px] border border-border divide-y divide-border">
							{visibleLevels.map(({ level, count }) => (
								<li key={level} className="flex items-center justify-between px-3 py-2 text-sm">
									<span>{JUDGE_PRIORITY_LABELS[level]}</span>
									<span className="font-mono text-sm font-bold">{count}</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<p className="font-mono text-xs text-muted-foreground">
				DLQ(격리된 작업) {status.deadLetters}건 · 마지막 갱신 {checkedAtLabel}
			</p>
		</div>
	);
}
