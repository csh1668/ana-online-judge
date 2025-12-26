"use client";

import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OutputPanelProps {
	output: {
		stdout: string;
		stderr: string;
		timeMs: number;
		memoryKb: number;
		compileOutput?: string | null;
	} | null;
	isRunning: boolean;
}

export function OutputPanel({ output, isRunning }: OutputPanelProps) {
	if (isRunning) {
		return (
			<div className="h-full flex items-center justify-center bg-muted/10 border rounded-md">
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<Loader2 className="h-8 w-8 animate-spin" />
					<span>실행 중...</span>
				</div>
			</div>
		);
	}

	if (!output) {
		return (
			<div className="h-full flex items-center justify-center bg-muted/10 border rounded-md text-muted-foreground">
				실행 결과가 여기에 표시됩니다
			</div>
		);
	}

	return (
		<div className="h-full border rounded-md overflow-hidden bg-background flex flex-col">
			<div className="p-2 bg-muted/30 border-b flex justify-between items-center text-xs">
				<span className="font-semibold">실행 결과</span>
				<div className="flex gap-3 text-muted-foreground">
					<span>시간: {output.timeMs}ms</span>
					<span>메모리: {(output.memoryKb / 1024).toFixed(2)}MB</span>
				</div>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-4 font-mono text-sm">
					{/* 컴파일 에러가 있으면 먼저 표시 */}
					{output.compileOutput && (
						<pre className="text-red-500 whitespace-pre-wrap break-all mb-4">
							{output.compileOutput}
						</pre>
					)}

					{/* stdout 출력 */}
					{output.stdout && <pre className="whitespace-pre-wrap break-all">{output.stdout}</pre>}

					{/* stderr 출력 */}
					{output.stderr && (
						<pre className="text-red-500 whitespace-pre-wrap break-all">{output.stderr}</pre>
					)}

					{/* 출력이 하나도 없을 때 */}
					{!output.compileOutput && !output.stdout && !output.stderr && (
						<span className="text-muted-foreground italic">(출력 없음)</span>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
