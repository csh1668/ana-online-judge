"use client";

import { Clock } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useServerTime } from "@/hooks/use-server-time";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "aoj.server-time.collapsed";
const HIDDEN_PATH_PATTERNS = [/\/scoreboard(\/|$)/, /^\/test-scoreboard$/];

const KST_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
	timeZone: "Asia/Seoul",
	hour12: false,
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
});

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
	timeZone: "Asia/Seoul",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	weekday: "short",
});

type ContestContext = {
	type: "contest" | "practice";
	id: number;
};

type ContestTimeInfo = {
	title: string;
	startTime: number;
	endTime: number;
};

function parseContestContext(pathname: string): ContestContext | null {
	const contestMatch = pathname.match(/^\/contests\/(\d+)(?:\/|$)/);
	if (contestMatch) return { type: "contest", id: Number.parseInt(contestMatch[1], 10) };
	const practiceMatch = pathname.match(/^\/practices\/(\d+)(?:\/|$)/);
	if (practiceMatch) return { type: "practice", id: Number.parseInt(practiceMatch[1], 10) };
	return null;
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (n: number) => n.toString().padStart(2, "0");
	if (days > 0) return `${days}일 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function useContestTimeInfo(context: ContestContext | null): ContestTimeInfo | null {
	const [info, setInfo] = useState<ContestTimeInfo | null>(null);

	useEffect(() => {
		if (!context) {
			setInfo(null);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/contest-time?type=${context.type}&id=${context.id}`, {
					cache: "no-store",
				});
				if (!res.ok) {
					if (!cancelled) setInfo(null);
					return;
				}
				const data = (await res.json()) as {
					title: string;
					startTime: string;
					endTime: string;
				};
				if (cancelled) return;
				setInfo({
					title: data.title,
					startTime: new Date(data.startTime).getTime(),
					endTime: new Date(data.endTime).getTime(),
				});
			} catch {
				if (!cancelled) setInfo(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [context]);

	return info;
}

function ContestStatusBlock({
	info,
	context,
	serverNow,
}: {
	info: ContestTimeInfo;
	context: ContestContext;
	serverNow: number;
}) {
	const label = context.type === "contest" ? "대회" : "연습";
	let status: "upcoming" | "running" | "finished";
	let remainingMs = 0;
	if (serverNow < info.startTime) {
		status = "upcoming";
		remainingMs = info.startTime - serverNow;
	} else if (serverNow <= info.endTime) {
		status = "running";
		remainingMs = info.endTime - serverNow;
	} else {
		status = "finished";
	}

	const statusText =
		status === "upcoming" ? "시작까지" : status === "running" ? "남은 시간" : "종료됨";
	const statusColor =
		status === "running"
			? "text-primary"
			: status === "upcoming"
				? "text-muted-foreground"
				: "text-muted-foreground";

	return (
		<div className="border-t border-border pt-2 mt-2 space-y-1">
			<div className="flex items-baseline justify-between gap-2">
				<span className={cn("text-[11px]", statusColor)}>{statusText}</span>
				{status !== "finished" ? (
					<span className="font-mono text-base font-semibold tabular-nums">
						{formatDuration(remainingMs)}
					</span>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				)}
			</div>
		</div>
	);
}

export function ServerTimeFloater() {
	const pathname = usePathname();
	const { serverNow, isSynced } = useServerTime();
	const [collapsed, setCollapsed] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		try {
			const stored = localStorage.getItem(COLLAPSED_KEY);
			if (stored === "1") setCollapsed(true);
		} catch {
			// ignore
		}
	}, []);

	const context = useMemo(() => parseContestContext(pathname), [pathname]);
	const info = useContestTimeInfo(context);

	const isHidden = HIDDEN_PATH_PATTERNS.some((p) => p.test(pathname));

	const toggleCollapsed = () => {
		setCollapsed((prev) => {
			const next = !prev;
			try {
				localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
			} catch {
				// ignore
			}
			return next;
		});
	};

	if (!mounted || isHidden) return null;

	const timeStr = KST_TIME_FORMATTER.format(serverNow);
	const dateStr = KST_DATE_FORMATTER.format(serverNow);

	if (collapsed) {
		return (
			<div className="fixed bottom-4 right-4 z-40">
				<Button
					variant="outline"
					size="sm"
					onClick={toggleCollapsed}
					className="h-9 gap-2 rounded-[2px] bg-card font-mono text-xs tabular-nums shadow-md"
					aria-label="서버 시간 펼치기"
				>
					<Clock className="size-3.5" />
					{timeStr}
				</Button>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={toggleCollapsed}
			aria-label="서버 시간 접기"
			className={cn(
				"fixed bottom-4 right-4 z-40 w-[200px] text-left cursor-pointer",
				"rounded-[2px] border border-border bg-card text-card-foreground shadow-md",
				"hover:bg-secondary/40 transition-colors"
			)}
		>
			<div className="px-3 py-3 pt-2">
				<div className="font-mono text-2xl font-bold tabular-nums leading-none flex items-center gap-2">
					<Clock className="size-5 shrink-0" />
					<span>{timeStr}</span>
					{!isSynced && (
						<span className="ml-1 text-[10px] font-sans font-normal text-muted-foreground">
							동기화 중…
						</span>
					)}
				</div>
				<div className="text-[11px] text-muted-foreground mt-1">{dateStr}</div>
				{context && info && (
					<ContestStatusBlock info={info} context={context} serverNow={serverNow} />
				)}
			</div>
		</button>
	);
}
