"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { updateTestcase } from "@/actions/admin/testcases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DeleteTestcaseButton } from "./delete-button";

type Testcase = {
	id: number;
	inputPath: string;
	outputPath: string;
	subtaskGroup: number | null;
	score: number | null;
	isHidden: boolean;
};

interface Props {
	problemId: number;
	initialTestcases: Testcase[];
}

/**
 * Divider UX: the editor holds an ordered list of `{ type: "tc" | "divider" }`
 * entries. Dividers partition the list into subtask groups; group N is the
 * run of TCs after the (N-1)-th divider (1-indexed). No dividers → all TCs
 * belong to group 0 (the non-subtask default).
 *
 * On save, we assign subtaskGroup numbers top-down and call updateTestcase
 * for each TC whose group changed. The service layer will recompute
 * problems.has_subtasks / max_score.
 */
type Entry = { type: "tc"; tc: Testcase } | { type: "divider"; id: string };

function buildInitialEntries(tcs: Testcase[]): Entry[] {
	// Group by subtaskGroup (null/0 treated the same). Sort groups ascending;
	// within group keep input order.
	const byGroup = new Map<number, Testcase[]>();
	for (const tc of tcs) {
		const g = tc.subtaskGroup ?? 0;
		if (!byGroup.has(g)) byGroup.set(g, []);
		byGroup.get(g)!.push(tc);
	}
	const sortedGroups = [...byGroup.keys()].sort((a, b) => a - b);
	const entries: Entry[] = [];
	sortedGroups.forEach((g, idx) => {
		if (idx > 0) entries.push({ type: "divider", id: `d-${g}` });
		for (const tc of byGroup.get(g)!) entries.push({ type: "tc", tc });
	});
	return entries;
}

function computeGroups(entries: Entry[]): Array<{ group: number; entries: Entry[] }> {
	// Group 0 for non-subtask, else 1..N
	const hasDivider = entries.some((e) => e.type === "divider");
	if (!hasDivider) {
		return [{ group: 0, entries: entries.filter((e) => e.type === "tc") }];
	}
	const groups: Array<{ group: number; entries: Entry[] }> = [];
	let current: Entry[] = [];
	let g = 1;
	const flush = () => {
		if (current.length > 0) {
			groups.push({ group: g, entries: current });
			g += 1;
			current = [];
		}
	};
	for (const e of entries) {
		if (e.type === "divider") {
			flush();
		} else {
			current.push(e);
		}
	}
	flush();
	return groups;
}

export function TestcasesEditor({ problemId, initialTestcases }: Props) {
	const [entries, setEntries] = useState<Entry[]>(() => buildInitialEntries(initialTestcases));
	const [scores, setScores] = useState<Record<number, number>>(() =>
		Object.fromEntries(initialTestcases.map((t) => [t.id, t.score ?? 0]))
	);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const grouped = computeGroups(entries);
	const hasSubtasks = grouped.length > 1;

	function addDivider(afterIdx: number) {
		setEntries((prev) => {
			const next = [...prev];
			next.splice(afterIdx + 1, 0, { type: "divider", id: crypto.randomUUID() });
			return next;
		});
	}

	function removeDivider(atIdx: number) {
		setEntries((prev) => prev.filter((_, i) => i !== atIdx));
	}

	async function save() {
		setError(null);
		// Build current tc -> subtaskGroup mapping
		const updates: Array<{ id: number; subtaskGroup: number; score: number }> = [];
		for (const grp of grouped) {
			for (const e of grp.entries) {
				if (e.type !== "tc") continue;
				updates.push({
					id: e.tc.id,
					subtaskGroup: grp.group,
					score: scores[e.tc.id] ?? 0,
				});
			}
		}

		startTransition(async () => {
			try {
				for (const u of updates) {
					// Only call updateTestcase if something actually changed
					const original = initialTestcases.find((t) => t.id === u.id);
					if (!original) continue;
					const changed =
						(original.subtaskGroup ?? 0) !== u.subtaskGroup || (original.score ?? 0) !== u.score;
					if (!changed) continue;
					await updateTestcase(u.id, problemId, {
						subtaskGroup: u.subtaskGroup,
						score: u.score,
					});
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
			}
		});
	}

	return (
		<Card>
			<CardContent className="space-y-3 p-4">
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						{hasSubtasks
							? `서브테스크 문제 — ${grouped.length}개 그룹`
							: "일반 문제 (구분선 추가 시 서브테스크 문제로 전환)"}
					</div>
					<Button onClick={save} disabled={pending} size="sm">
						{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						저장
					</Button>
				</div>
				{error && <div className="text-sm text-destructive">{error}</div>}

				<div className="space-y-2">
					{grouped.map((grp) => (
						<div key={`group-${grp.group}`} className="rounded-md border">
							<div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm">
								<div className="flex items-center gap-2">
									<span className="font-medium">
										{hasSubtasks ? `Subtask ${grp.group}` : "테스트케이스"}
									</span>
									<Badge variant="outline">{grp.entries.length} TC</Badge>
									{hasSubtasks && (
										<Badge variant="secondary">
											Σ{" "}
											{grp.entries.reduce(
												(acc, e) => acc + (e.type === "tc" ? (scores[e.tc.id] ?? 0) : 0),
												0
											)}
											점
										</Badge>
									)}
								</div>
							</div>
							<div className="divide-y">
								{grp.entries.map((e) => {
									if (e.type !== "tc") return null;
									const flatIdx = entries.indexOf(e);
									return (
										<div key={e.tc.id} className="flex items-center gap-3 px-3 py-2 text-sm">
											<span className="font-mono text-muted-foreground w-8">#{e.tc.id}</span>
											<span className="font-mono text-xs truncate flex-1">{e.tc.inputPath}</span>
											<label
												htmlFor={`tc-score-${e.tc.id}`}
												className="flex items-center gap-1 text-xs text-muted-foreground"
											>
												점수
												<Input
													id={`tc-score-${e.tc.id}`}
													type="number"
													min={0}
													value={scores[e.tc.id] ?? 0}
													onChange={(ev) =>
														setScores((prev) => ({
															...prev,
															[e.tc.id]: Number.parseInt(ev.target.value, 10) || 0,
														}))
													}
													className="w-20"
													disabled={!hasSubtasks}
												/>
											</label>
											<DeleteTestcaseButton testcaseId={e.tc.id} problemId={problemId} />
											<Button
												variant="ghost"
												size="sm"
												onClick={() => addDivider(flatIdx)}
												title="이 테스트케이스 뒤에 구분선 추가"
											>
												<Plus className="h-3 w-3" /> 구분선
											</Button>
										</div>
									);
								})}
							</div>
						</div>
					))}
				</div>

				{hasSubtasks && (
					<div className="pt-2 text-xs text-muted-foreground">
						구분선은 아래 목록의 휴지통 버튼으로 제거할 수 있습니다.
					</div>
				)}

				{/* Dividers in-line management (for removal) */}
				<div className="space-y-1">
					{entries.map((e, i) =>
						e.type === "divider" ? (
							<div
								key={e.id}
								className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1 text-xs"
							>
								<span className="flex-1">— 구분선 —</span>
								<Button variant="ghost" size="sm" onClick={() => removeDivider(i)}>
									<Trash2 className="h-3 w-3" />
								</Button>
							</div>
						) : null
					)}
				</div>
			</CardContent>
		</Card>
	);
}
