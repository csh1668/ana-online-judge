"use client";

import Link from "next/link";
import type { PracticeListItem } from "@/actions/practices";
import { ContestTime } from "@/components/contests/contest-time";
import { Badge } from "@/components/ui/badge";
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

function StatusBadge({ status }: { status: ReturnType<typeof getPracticeStatus> }) {
	if (status === "upcoming") return <Badge variant="secondary">예정</Badge>;
	if (status === "running") return <Badge variant="default">진행중</Badge>;
	return <Badge variant="outline">종료</Badge>;
}

export function PracticeListTable({ practices }: { practices: PracticeListItem[] }) {
	if (practices.length === 0) {
		return <div className="text-center py-12 text-muted-foreground">아직 연습이 없습니다.</div>;
	}
	return (
		<div className="rounded-md border">
			<Table>
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
									isRunning &&
										"bg-emerald-500/10 hover:bg-emerald-500/15 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20"
								)}
							>
								<TableCell className="font-medium">
									<Link href={`/practices/${p.id}`} className="hover:underline">
										{p.title}
									</Link>
								</TableCell>
								<TableCell>
									<StatusBadge status={status} />
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
		</div>
	);
}
