"use client";

import Link from "next/link";
import { AdminSortableHeader } from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AdminSubmissionRow } from "@/lib/services/admin-submissions";
import { useSelection } from "./selection-context";

const VERDICT_LABEL: Record<string, string> = {
	pending: "Pending",
	judging: "Judging",
	accepted: "AC",
	wrong_answer: "WA",
	time_limit_exceeded: "TLE",
	memory_limit_exceeded: "MLE",
	runtime_error: "RE",
	compile_error: "CE",
	system_error: "SE",
	skipped: "Skipped",
	presentation_error: "PE",
	fail: "Fail",
	partial: "Partial",
};

function formatDateTime(d: Date) {
	return new Intl.DateTimeFormat("ko-KR", {
		year: "2-digit",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(d);
}

export function AdminSubmissionsTable({ rows }: { rows: AdminSubmissionRow[] }) {
	const sel = useSelection();
	const pageIds = rows.map((r) => r.id);
	const allSelectedOnPage =
		sel.mode === "rows" && pageIds.length > 0 && pageIds.every((id) => sel.rowIds.has(id));
	const filterMode = sel.mode === "filter";

	return (
		<div className="rounded-md border">
			<Table className="min-w-[1200px]">
				<TableHeader>
					<TableRow>
						<TableHead className="w-[40px]">
							<Checkbox
								checked={allSelectedOnPage}
								onCheckedChange={(v) => sel.togglePage(pageIds, v === true)}
								disabled={filterMode}
							/>
						</TableHead>
						<AdminSortableHeader sortKey="id" className="w-[80px]">
							ID
						</AdminSortableHeader>
						<TableHead>사용자</TableHead>
						<TableHead>문제</TableHead>
						<TableHead className="w-[110px]">판정</TableHead>
						<AdminSortableHeader sortKey="executionTime" className="w-[80px]">
							시간
						</AdminSortableHeader>
						<AdminSortableHeader sortKey="memoryUsed" className="w-[80px]">
							메모리
						</AdminSortableHeader>
						<TableHead className="w-[80px]">언어</TableHead>
						<TableHead className="w-[140px]">대회</TableHead>
						<AdminSortableHeader sortKey="createdAt" className="w-[140px]">
							제출일
						</AdminSortableHeader>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r) => (
						<TableRow key={r.id} data-selected={sel.rowIds.has(r.id) ? "true" : undefined}>
							<TableCell>
								<Checkbox
									checked={sel.rowIds.has(r.id)}
									onCheckedChange={(v) => sel.toggleRow(r.id, v === true)}
									disabled={filterMode}
								/>
							</TableCell>
							<TableCell className="font-mono">
								<Link href={`/submissions/${r.id}`} className="hover:underline">
									{r.id}
								</Link>
							</TableCell>
							<TableCell>
								<Link href={`/profile/${r.userUsername}`} className="hover:underline">
									{r.userUsername}
								</Link>
							</TableCell>
							<TableCell className="max-w-[260px] truncate">
								<Link href={`/problems/${r.problemId}`} className="hover:underline">
									#{r.problemId} {r.problemTitle}
								</Link>
							</TableCell>
							<TableCell>
								<Badge variant="outline">{VERDICT_LABEL[r.verdict] ?? r.verdict}</Badge>
							</TableCell>
							<TableCell className="font-mono text-xs">
								{r.executionTime != null ? `${r.executionTime}ms` : "-"}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{r.memoryUsed != null ? `${r.memoryUsed}KB` : "-"}
							</TableCell>
							<TableCell>{r.language}</TableCell>
							<TableCell className="text-muted-foreground text-xs">
								{r.contestId ? (
									<Link href={`/contests/${r.contestId}`} className="hover:underline">
										{r.contestProblemLabel
											? `${r.contestTitle} (${r.contestProblemLabel})`
											: r.contestTitle}
									</Link>
								) : (
									"-"
								)}
							</TableCell>
							<TableCell className="text-muted-foreground text-xs">
								{formatDateTime(r.createdAt)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
