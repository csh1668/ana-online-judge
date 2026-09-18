"use client";

import Link from "next/link";
import type { PracticeListItem } from "@/actions/practices";
import { ContestStatusBadge } from "@/components/contests/contest-status-badge";
import { ContestTime } from "@/components/contests/contest-time";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getPracticeStatus } from "@/lib/practice-utils";
import { cn } from "@/lib/utils";

export function PracticeListTable({ practices }: { practices: PracticeListItem[] }) {
	if (practices.length === 0) {
		return <EmptyState>아직 연습이 없습니다.</EmptyState>;
	}
	return (
		<Table className="min-w-[920px]">
			<TableHeader>
				<TableRow>
					<TableHead>제목</TableHead>
					<TableHead className="w-[160px]">상태</TableHead>
					<TableHead className="w-[160px]">생성자</TableHead>
					<TableHead className="w-[180px]">시작 시간</TableHead>
					<TableHead className="w-[180px]">종료 시간</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{practices.map((p) => {
					const status = getPracticeStatus(p);
					const isRunning = status === "running";
					return (
						<TableRow
							key={p.id}
							className={cn(
								isRunning && "bg-(--verdict-accepted-bg) hover:bg-(--verdict-accepted-bg)"
							)}
						>
							<TableCell>
								<Link
									href={`/practices/${p.id}`}
									className="block truncate font-medium hover:text-primary transition-colors"
									title={p.title}
								>
									{p.title}
								</Link>
							</TableCell>
							<TableCell>
								<ContestStatusBadge status={status} />
							</TableCell>
							<TableCell className="text-muted-foreground">{p.creatorName}</TableCell>
							<TableCell>
								<ContestTime date={p.startTime} />
							</TableCell>
							<TableCell>
								<ContestTime date={p.endTime} />
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
