"use client";

import { ArrowDownToLine, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface LogControlsProps {
	paused: boolean;
	autoScroll: boolean;
	showTimestamps: boolean;
	connected: boolean;
	lineCount: number;
	onTogglePause: () => void;
	onToggleAutoScroll: (next: boolean) => void;
	onToggleTimestamps: (next: boolean) => void;
	onClear: () => void;
	onScrollToBottom: () => void;
}

export function LogControls({
	paused,
	autoScroll,
	showTimestamps,
	connected,
	lineCount,
	onTogglePause,
	onToggleAutoScroll,
	onToggleTimestamps,
	onClear,
	onScrollToBottom,
}: LogControlsProps) {
	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
			<Button variant="outline" size="sm" onClick={onTogglePause}>
				{paused ? (
					<>
						<Play className="mr-1 h-3.5 w-3.5" /> 재개
					</>
				) : (
					<>
						<Pause className="mr-1 h-3.5 w-3.5" /> 일시정지
					</>
				)}
			</Button>
			<Button variant="outline" size="sm" onClick={onScrollToBottom}>
				<ArrowDownToLine className="mr-1 h-3.5 w-3.5" /> 맨 아래로
			</Button>
			<Button variant="outline" size="sm" onClick={onClear}>
				<Trash2 className="mr-1 h-3.5 w-3.5" /> 클리어
			</Button>
			<div className="ml-2 flex items-center gap-2">
				<Switch id="autoscroll" checked={autoScroll} onCheckedChange={onToggleAutoScroll} />
				<Label htmlFor="autoscroll" className="text-xs">
					자동 스크롤
				</Label>
			</div>
			<div className="flex items-center gap-2">
				<Switch id="timestamps" checked={showTimestamps} onCheckedChange={onToggleTimestamps} />
				<Label htmlFor="timestamps" className="text-xs">
					타임스탬프
				</Label>
			</div>
			<div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<span
						className={cn(
							"inline-block size-1.5 rounded-full",
							connected ? "bg-emerald-500" : "bg-zinc-400"
						)}
					/>
					{connected ? "연결됨" : "연결 끊김"}
				</span>
				<span>{lineCount.toLocaleString()} 줄</span>
			</div>
		</div>
	);
}
