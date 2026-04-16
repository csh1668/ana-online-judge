"use client";

import type { Verdict } from "@/db/schema";
import { cn } from "@/lib/utils";
import {
	expectedVerdictLabel,
	isPending,
	matchesExpectedVerdict,
	verdictShortLabel,
	type WorkshopExpectedVerdict,
} from "@/lib/workshop/expected-verdict";

export type MatrixSolution = {
	id: number;
	name: string;
	language: string;
	expectedVerdict: WorkshopExpectedVerdict;
};

export type MatrixTestcase = {
	id: number;
	index: number;
};

export type MatrixCell = {
	solutionId: number;
	testcaseId: number;
	verdict: Verdict;
	timeMs: number | null;
	memoryKb: number | null;
};

type Props = {
	solutions: MatrixSolution[];
	testcases: MatrixTestcase[];
	cells: MatrixCell[];
	onCellClick?: (cell: { solutionId: number; testcaseId: number }) => void;
};

export function InvocationMatrix({ solutions, testcases, cells, onCellClick }: Props) {
	// Build a (solutionId, testcaseId) -> MatrixCell lookup. Duplicate keys
	// (shouldn't happen) -- last wins.
	const cellMap = new Map<string, MatrixCell>();
	for (const c of cells) {
		cellMap.set(`${c.solutionId}_${c.testcaseId}`, c);
	}

	return (
		<div className="overflow-x-auto border rounded">
			<table className="w-full text-sm border-collapse">
				<thead>
					<tr className="bg-muted/50">
						<th className="p-2 text-left font-medium border-b sticky left-0 bg-muted/50">솔루션</th>
						{testcases.map((t) => (
							<th key={t.id} className="p-2 text-center font-medium border-b border-l">
								{t.index}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{solutions.map((s) => (
						<tr key={s.id} className="border-b">
							<td className="p-2 sticky left-0 bg-background border-r">
								<div className="font-mono text-sm">{s.name}</div>
								<div className="text-xs text-muted-foreground">
									{s.language} · {expectedVerdictLabel(s.expectedVerdict)}
								</div>
							</td>
							{testcases.map((t) => {
								const cell = cellMap.get(`${s.id}_${t.id}`);
								const cellState = cell
									? isPending(cell.verdict)
										? "pending"
										: matchesExpectedVerdict(s.expectedVerdict, cell.verdict)
											? "match"
											: "mismatch"
									: "pending";
								return (
									<td
										key={t.id}
										className={cn(
											"p-1 text-center border-l cursor-pointer hover:opacity-80",
											cellState === "match" && "bg-green-500/20 text-green-700",
											cellState === "mismatch" && "bg-red-500/20 text-red-700",
											cellState === "pending" && "bg-muted/30 text-muted-foreground"
										)}
										onClick={() => cell && onCellClick?.({ solutionId: s.id, testcaseId: t.id })}
									>
										<div className="font-mono text-xs">
											{cell ? verdictShortLabel(cell.verdict) : "..."}
										</div>
										{cell && cell.verdict !== "pending" && cell.verdict !== "judging" && (
											<div className="text-[10px] text-muted-foreground">
												{cell.timeMs !== null ? `${cell.timeMs}ms` : "-"}
												{cell.memoryKb !== null ? ` · ${Math.round(cell.memoryKb / 1024)}MB` : ""}
											</div>
										)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
