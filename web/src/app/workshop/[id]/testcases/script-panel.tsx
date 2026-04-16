"use client";

import Editor from "@monaco-editor/react";
import { Loader2, Play, Save } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { runWorkshopScript, saveWorkshopScript } from "@/actions/workshop/script";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type ProgressRow = {
	job_id: string;
	testcase_index: number;
	status: "pending" | "done" | "failed";
	message?: string;
	timeMs?: number;
	memoryKb?: number;
};

type Props = {
	problemId: number;
	initialScript: string;
};

export function ScriptPanel({ problemId, initialScript }: Props) {
	const [script, setScript] = useState(initialScript);
	const [dirty, setDirty] = useState(false);
	const [saving, startSave] = useTransition();
	const [running, startRun] = useTransition();
	const [runId, setRunId] = useState<string | null>(null);
	const [progress, setProgress] = useState<ProgressRow[]>([]);
	const [done, setDone] = useState(false);
	const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[] | null>(null);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const esRef = useRef<EventSource | null>(null);

	useEffect(() => {
		return () => {
			if (esRef.current) esRef.current.close();
		};
	}, []);

	useEffect(() => {
		setDirty(script !== initialScript);
	}, [script, initialScript]);

	function attachSSE(id: string) {
		if (esRef.current) esRef.current.close();
		const es = new EventSource(
			`/api/workshop/${problemId}/generate/stream?runId=${encodeURIComponent(id)}`
		);
		es.addEventListener("snapshot", (e) => {
			const data = JSON.parse((e as MessageEvent).data) as {
				progress: ProgressRow[];
				done: boolean;
			};
			setProgress(data.progress);
			setDone(data.done);
		});
		es.addEventListener("progress", (e) => {
			const data = JSON.parse((e as MessageEvent).data) as ProgressRow;
			setProgress((prev) => {
				const idx = prev.findIndex((p) => p.job_id === data.job_id);
				if (idx === -1) return [...prev, data];
				const next = prev.slice();
				next[idx] = data;
				return next;
			});
		});
		es.addEventListener("complete", () => {
			setDone(true);
			es.close();
			esRef.current = null;
		});
		es.onerror = () => {
			// Let EventSource auto-retry; surface a toast on first failure only.
			console.warn("SSE error (auto-retry)");
		};
		esRef.current = es;
	}

	function onSave() {
		startSave(async () => {
			try {
				await saveWorkshopScript(problemId, script);
				toast.success("스크립트가 저장되었습니다");
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장 실패");
			}
		});
	}

	function onRun() {
		setParseErrors(null);
		setRuntimeError(null);
		setProgress([]);
		setDone(false);
		setRunId(null);
		startRun(async () => {
			try {
				const result = await runWorkshopScript(problemId, script);
				if (!result.ok) {
					if (result.kind === "parse") {
						setParseErrors(result.errors);
						toast.error("스크립트 오류");
					} else {
						setRuntimeError(result.message);
						toast.error(result.message);
					}
					return;
				}
				setRunId(result.runId);
				toast.success(`실행 시작: 생성 ${result.generatedCount}개, 수동 ${result.manualCount}개`);
				if (result.generatedCount === 0) {
					setDone(true);
				} else {
					attachSSE(result.runId);
				}
			} catch (err) {
				setRuntimeError(err instanceof Error ? err.message : "실행 실패");
				toast.error("실행 실패");
			}
		});
	}

	const totalJobs = progress.length;
	const settledJobs = progress.filter((p) => p.status !== "pending").length;
	const failedJobs = progress.filter((p) => p.status === "failed").length;
	const percent = totalJobs === 0 ? 0 : Math.round((settledJobs / totalJobs) * 100);

	return (
		<section className="border rounded p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">스크립트</h2>
					<p className="text-xs text-muted-foreground">
						스펙 &sect;6 문법 &mdash; <code className="font-mono">for i in 1..5:</code>,{" "}
						<code className="font-mono">manual</code>,{" "}
						<code className="font-mono">gen-name [i]</code>
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={onSave} disabled={saving || !dirty}>
						<Save className="h-4 w-4 mr-1" />
						{saving ? "저장 중..." : "저장"}
					</Button>
					<Button onClick={onRun} disabled={running}>
						{running ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								실행 중...
							</>
						) : (
							<>
								<Play className="h-4 w-4 mr-1" />
								스크립트 실행
							</>
						)}
					</Button>
				</div>
			</div>
			<div className="border rounded overflow-hidden">
				<Editor
					height="320px"
					value={script}
					language="plaintext"
					theme="vs-dark"
					options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
					onChange={(v) => setScript(v ?? "")}
				/>
			</div>
			{parseErrors && parseErrors.length > 0 && (
				<div className="border border-destructive/40 bg-destructive/5 rounded p-3 text-sm space-y-1">
					<div className="font-medium text-destructive">스크립트 파싱 오류</div>
					<ul className="list-disc pl-5">
						{parseErrors.map((e) => (
							<li key={`${e.line}-${e.message}`}>
								<span className="font-mono">L{e.line}:</span> {e.message}
							</li>
						))}
					</ul>
				</div>
			)}
			{runtimeError && (
				<div className="border border-destructive/40 bg-destructive/5 rounded p-3 text-sm text-destructive">
					{runtimeError}
				</div>
			)}
			{runId && totalJobs > 0 && (
				<div className="space-y-2">
					<div className="flex items-center justify-between text-sm">
						<div className="flex items-center gap-2">
							<span>
								진행: {settledJobs} / {totalJobs}
							</span>
							{failedJobs > 0 && <Badge variant="destructive">{failedJobs}개 실패</Badge>}
							{done && <Badge variant="default">완료</Badge>}
						</div>
						<span className="text-xs text-muted-foreground">run #{runId.slice(0, 8)}</span>
					</div>
					<Progress value={percent} />
					<div className="max-h-48 overflow-y-auto border rounded divide-y">
						{progress
							.slice()
							.sort((a, b) => a.testcase_index - b.testcase_index)
							.map((p) => (
								<div
									key={p.job_id}
									className="flex items-center justify-between px-3 py-1.5 text-xs"
								>
									<span className="font-mono">#{p.testcase_index}</span>
									<div className="flex items-center gap-2">
										{p.status === "pending" && (
											<Badge variant="secondary">
												<Loader2 className="h-3 w-3 mr-1 animate-spin" />
												pending
											</Badge>
										)}
										{p.status === "done" && <Badge variant="default">done</Badge>}
										{p.status === "failed" && (
											<Badge variant="destructive" title={p.message}>
												failed
											</Badge>
										)}
										{p.timeMs !== undefined && (
											<span className="text-muted-foreground">{p.timeMs}ms</span>
										)}
									</div>
								</div>
							))}
					</div>
				</div>
			)}
		</section>
	);
}
