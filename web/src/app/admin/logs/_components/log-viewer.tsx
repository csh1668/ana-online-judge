"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { LogControls } from "./log-controls";

const TABS = [
	{ name: "aoj-judge", label: "judge" },
	{ name: "aoj-web", label: "web" },
	{ name: "aoj-postgres", label: "postgres" },
	{ name: "aoj-redis", label: "redis" },
	{ name: "aoj-minio", label: "minio" },
] as const;

const RING_BUFFER_SIZE = 10000;
const STATUS_POLL_MS = 30000;

type ContainerState = "running" | "exited" | "unknown";

interface LogLine {
	id: number;
	t: "out" | "err";
	line: string;
}

interface ContainerStatusResponse {
	containers: Array<{ name: string; state: ContainerState; status: string }>;
}

export function LogViewer() {
	const [active, setActive] = useState<string>(TABS[0].name);
	const [statuses, setStatuses] = useState<Record<string, ContainerState>>({});

	useEffect(() => {
		let cancelled = false;
		const fetchStatuses = async () => {
			try {
				const res = await fetch("/api/admin/logs/containers", { cache: "no-store" });
				if (!res.ok) throw new Error("status fetch failed");
				const data = (await res.json()) as ContainerStatusResponse;
				if (cancelled) return;
				const map: Record<string, ContainerState> = {};
				for (const c of data.containers) map[c.name] = c.state;
				setStatuses(map);
			} catch {
				if (cancelled) return;
				setStatuses(Object.fromEntries(TABS.map((t) => [t.name, "unknown"])));
			}
		};
		fetchStatuses();
		const interval = setInterval(fetchStatuses, STATUS_POLL_MS);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	return (
		<Tabs value={active} onValueChange={setActive}>
			<TabsList>
				{TABS.map((tab) => (
					<TabsTrigger key={tab.name} value={tab.name}>
						<StatusDot state={statuses[tab.name] ?? "unknown"} />
						<span>{tab.label}</span>
					</TabsTrigger>
				))}
			</TabsList>
			{TABS.map((tab) => (
				<TabsContent key={tab.name} value={tab.name} forceMount hidden={active !== tab.name}>
					<LogPanel container={tab.name} active={active === tab.name} />
				</TabsContent>
			))}
		</Tabs>
	);
}

function StatusDot({ state }: { state: ContainerState }) {
	const color =
		state === "running" ? "bg-emerald-500" : state === "exited" ? "bg-zinc-400" : "bg-amber-400";
	return <span className={cn("inline-block size-2 rounded-full", color)} aria-hidden="true" />;
}

interface LogPanelProps {
	container: string;
	active: boolean;
}

function LogPanel({ container, active }: LogPanelProps) {
	const [lines, setLines] = useState<LogLine[]>([]);
	const [paused, setPaused] = useState(false);
	const [autoScroll, setAutoScroll] = useState(true);
	const [showTimestamps, setShowTimestamps] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [connected, setConnected] = useState(false);

	const idRef = useRef(0);
	const pausedRef = useRef(false);
	const autoScrollRef = useRef(true);
	const bufferRef = useRef<LogLine[]>([]);
	const containerRef = useRef<HTMLDivElement | null>(null);

	pausedRef.current = paused;
	autoScrollRef.current = autoScroll;

	useEffect(() => {
		if (!active) return;

		// Reset on container/active switch
		setLines([]);
		bufferRef.current = [];
		setError(null);
		setConnected(false);

		const url = `/api/admin/logs/stream?container=${encodeURIComponent(container)}&tail=1000&timestamps=1`;
		const es = new EventSource(url);

		es.addEventListener("connected", () => setConnected(true));

		es.addEventListener("log", (event) => {
			try {
				const data = JSON.parse((event as MessageEvent).data) as {
					t: "out" | "err";
					line: string;
				};
				const newLine: LogLine = { id: idRef.current++, t: data.t, line: data.line };
				if (pausedRef.current) {
					const next = [...bufferRef.current, newLine];
					bufferRef.current = next.length > RING_BUFFER_SIZE ? next.slice(-RING_BUFFER_SIZE) : next;
				} else {
					setLines((prev) => {
						const merged =
							bufferRef.current.length > 0
								? [...prev, ...bufferRef.current, newLine]
								: [...prev, newLine];
						bufferRef.current = [];
						return merged.length > RING_BUFFER_SIZE ? merged.slice(-RING_BUFFER_SIZE) : merged;
					});
				}
			} catch {
				// Bad JSON; skip
			}
		});

		es.addEventListener("stream-error", (event) => {
			try {
				const { message } = JSON.parse((event as MessageEvent).data) as {
					code: string;
					message: string;
				};
				setError(message);
			} catch {
				setError("스트림 오류");
			}
			setConnected(false);
			es.close();
		});

		// Transport-level errors trigger EventSource auto-reconnect.
		es.onerror = () => setConnected(false);

		return () => {
			es.close();
		};
	}, [container, active]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: lines.length triggers re-scroll on each new line
	useEffect(() => {
		if (!autoScroll) return;
		const el = containerRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [lines.length, autoScroll]);

	const handleClear = useCallback(() => {
		setLines([]);
		bufferRef.current = [];
	}, []);

	const handleTogglePause = useCallback(() => {
		setPaused((wasPaused) => {
			if (wasPaused && bufferRef.current.length > 0) {
				const flush = bufferRef.current;
				bufferRef.current = [];
				setLines((prev) => {
					const merged = [...prev, ...flush];
					return merged.length > RING_BUFFER_SIZE ? merged.slice(-RING_BUFFER_SIZE) : merged;
				});
			}
			return !wasPaused;
		});
	}, []);

	const handleScrollToBottom = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
		setAutoScroll(true);
	}, []);

	const handleScroll = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
		if (!atBottom && autoScrollRef.current) setAutoScroll(false);
		if (atBottom && !autoScrollRef.current) setAutoScroll(true);
	}, []);

	return (
		<div className="flex flex-col gap-2">
			<LogControls
				paused={paused}
				autoScroll={autoScroll}
				showTimestamps={showTimestamps}
				connected={connected}
				lineCount={lines.length}
				onTogglePause={handleTogglePause}
				onToggleAutoScroll={setAutoScroll}
				onToggleTimestamps={setShowTimestamps}
				onClear={handleClear}
				onScrollToBottom={handleScrollToBottom}
			/>
			{error && (
				<div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}
			<div
				ref={containerRef}
				onScroll={handleScroll}
				className="h-[calc(100vh-22rem)] min-h-[400px] overflow-auto rounded border bg-zinc-950 p-3 font-mono text-xs leading-relaxed"
			>
				{lines.length === 0 && !error && (
					<div className="text-zinc-500">{connected ? "로그를 기다리는 중…" : "연결 중…"}</div>
				)}
				{lines.map((l) => (
					<LogLineRow key={l.id} line={l} showTimestamps={showTimestamps} />
				))}
			</div>
		</div>
	);
}

const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s(.*)$/;

function LogLineRow({ line, showTimestamps }: { line: LogLine; showTimestamps: boolean }) {
	const match = line.line.match(TS_RE);
	const ts = match ? match[1] : null;
	const body = match ? match[2] : line.line;
	return (
		<div
			className={cn(
				"whitespace-pre-wrap break-all",
				line.t === "err" ? "text-red-400" : "text-zinc-200"
			)}
		>
			{showTimestamps && ts && <span className="mr-2 text-zinc-500">{formatTs(ts)}</span>}
			<span>{body}</span>
		</div>
	);
}

function formatTs(ts: string): string {
	// 2026-04-28T12:34:56.789012345Z -> 12:34:56.789
	const m = ts.match(/T(\d{2}:\d{2}:\d{2})\.(\d{1,3})/);
	return m ? `${m[1]}.${m[2].padEnd(3, "0").slice(0, 3)}` : ts;
}
