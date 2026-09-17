import Link from "next/link";
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
import { getContestStatus } from "@/lib/contest-utils";
import { cn } from "@/lib/utils";

export interface ContestListRow {
	id: number;
	title: string;
	startTime: Date;
	endTime: Date;
}

interface Props {
	contests: ContestListRow[];
	emptyLabel?: string;
}

export function ContestListTable({ contests, emptyLabel = "등록된 대회가 없습니다." }: Props) {
	if (contests.length === 0) {
		return <EmptyState>{emptyLabel}</EmptyState>;
	}

	return (
		<Table className="min-w-[840px]">
			<TableHeader>
				<TableRow>
					<TableHead className="w-[80px]">#</TableHead>
					<TableHead>제목</TableHead>
					<TableHead className="w-[120px]">상태</TableHead>
					<TableHead className="w-[180px]">시작 시간</TableHead>
					<TableHead className="w-[180px]">종료 시간</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{contests.map((contest) => {
					const status = getContestStatus(contest);
					const isRunning = status === "running";
					return (
						<TableRow
							key={contest.id}
							className={cn(
								isRunning && "bg-(--verdict-accepted-bg) hover:bg-(--verdict-accepted-bg)"
							)}
						>
							<TableCell className="font-mono text-muted-foreground">{contest.id}</TableCell>
							<TableCell>
								<Link
									href={`/contests/${contest.id}`}
									className="block truncate font-medium hover:text-primary transition-colors"
									title={contest.title}
								>
									{contest.title}
								</Link>
							</TableCell>
							<TableCell>
								<ContestStatusBadge status={status} />
							</TableCell>
							<TableCell className="text-muted-foreground">
								<ContestTime date={contest.startTime} />
							</TableCell>
							<TableCell className="text-muted-foreground">
								<ContestTime date={contest.endTime} />
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
