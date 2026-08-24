"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRejudgeHistoryAction } from "@/actions/admin/submissions";
import { VERDICT_LABELS } from "@/components/ui/badge";
import { formatRelativeKo } from "@/lib/format-time";
import type { RejudgeHistoryEntry } from "@/lib/services/admin-submissions";

const VERDICT_ORDER = [
	"accepted",
	"wrong_answer",
	"time_limit_exceeded",
	"memory_limit_exceeded",
	"runtime_error",
	"compile_error",
	"partial",
	"presentation_error",
	"output_limit_exceeded",
	"system_error",
	"fail",
	"skipped",
	"pending",
	"judging",
] as const;

export function RejudgeHistoryPanel({ problemId }: { problemId: number }) {
	const [entries, setEntries] = useState<RejudgeHistoryEntry[] | null>(null);
	useEffect(() => {
		getRejudgeHistoryAction(problemId)
			.then(setEntries)
			.catch(() => setEntries([]));
	}, [problemId]);

	if (entries === null) return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
	if (entries.length === 0)
		return <p className="text-sm text-muted-foreground">재채점 이력이 없습니다.</p>;

	return (
		<div className="space-y-6">
			{entries.map((e) => {
				const rows = VERDICT_ORDER.filter(
					(v) => (e.beforeCounts[v] ?? 0) > 0 || (e.afterCounts[v] ?? 0) > 0
				);
				return (
					<div key={e.batchId} className="rounded-[2px] border border-border p-4 space-y-2">
						<div className="flex items-center justify-between gap-2">
							<span className="text-sm font-medium">사유: {e.reason}</span>
							<span className="text-xs text-muted-foreground">
								{e.adminName ?? "관리자"} · {formatRelativeKo(e.createdAt)} · 총 {e.total}건
							</span>
						</div>
						<table className="w-full text-sm">
							<thead>
								<tr className="text-muted-foreground text-left">
									<th className="py-1 font-medium">결과</th>
									<th className="py-1 text-right font-medium">이전</th>
									<th className="py-1 text-right font-medium">이후</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((v) => {
									const label = VERDICT_LABELS[v]?.label ?? v;
									const before = e.beforeCounts[v] ?? 0;
									const after = e.afterCounts[v] ?? 0;
									const href = (phase: "before" | "after") =>
										`/admin/submissions?rejudgeBatch=${e.batchId}&phase=${phase}&verdict=${v}`;
									return (
										<tr key={v} className="border-t border-border">
											<td className="py-1">{label}</td>
											<td className="py-1 text-right">
												{before > 0 ? (
													<Link className="text-primary hover:underline" href={href("before")}>
														{before}
													</Link>
												) : (
													0
												)}
											</td>
											<td className="py-1 text-right">
												{after > 0 ? (
													<Link className="text-primary hover:underline" href={href("after")}>
														{after}
													</Link>
												) : (
													0
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				);
			})}
		</div>
	);
}
