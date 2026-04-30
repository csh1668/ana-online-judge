import Link from "next/link";
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

function getStatusBadge(status: string) {
	switch (status) {
		case "upcoming":
			return <Badge variant="secondary">예정</Badge>;
		case "running":
			return <Badge variant="default">진행중</Badge>;
		case "finished":
			return <Badge variant="outline">종료</Badge>;
		default:
			return null;
	}
}

export function ContestListTable({ contests, emptyLabel = "등록된 대회가 없습니다." }: Props) {
	if (contests.length === 0) {
		return <div className="text-center py-12 text-muted-foreground">{emptyLabel}</div>;
	}

	return (
		<div className="rounded-md border">
			<Table>
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
									isRunning &&
										"bg-emerald-500/10 hover:bg-emerald-500/15 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20"
								)}
							>
								<TableCell className="font-mono text-muted-foreground">{contest.id}</TableCell>
								<TableCell>
									<Link
										href={`/contests/${contest.id}`}
										className="font-medium hover:text-primary transition-colors"
									>
										{contest.title}
									</Link>
								</TableCell>
								<TableCell>{getStatusBadge(status)}</TableCell>
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
		</div>
	);
}
