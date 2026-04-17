import { Suspense } from "react";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ProblemType } from "@/db/schema";

export interface ProblemListRow {
	id: number;
	title: string;
	problemType: ProblemType;
	judgeAvailable: boolean;
	languageRestricted: boolean;
	isPublic: boolean;
	submissionCount: number;
	acceptedCount: number;
}

interface Props {
	problems: ProblemListRow[];
	userProblemStatuses: Map<number, { solved: boolean; score: number | null }>;
	sortable?: boolean;
	emptyLabel?: string;
}

function getAcceptRate(submissionCount: number, acceptedCount: number) {
	if (submissionCount === 0) return "-";
	return `${((acceptedCount / submissionCount) * 100).toFixed(1)}%`;
}

export function ProblemListTable({
	problems,
	userProblemStatuses,
	sortable = false,
	emptyLabel = "등록된 문제가 없습니다.",
}: Props) {
	if (problems.length === 0) {
		return <div className="text-center py-12 text-muted-foreground">{emptyLabel}</div>;
	}

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[80px]">
							{sortable ? (
								<Suspense fallback="#">
									<SortableHeader label="#" sortKey="id" />
								</Suspense>
							) : (
								"#"
							)}
						</TableHead>
						<TableHead>
							{sortable ? (
								<Suspense fallback="제목">
									<SortableHeader label="제목" sortKey="title" />
								</Suspense>
							) : (
								"제목"
							)}
						</TableHead>
						<TableHead className="w-[100px] text-right">
							{sortable ? (
								<Suspense fallback="제출">
									<SortableHeader label="제출" sortKey="submissionCount" className="justify-end" />
								</Suspense>
							) : (
								"제출"
							)}
						</TableHead>
						<TableHead className="w-[100px] text-right">
							{sortable ? (
								<Suspense fallback="정답률">
									<SortableHeader label="정답률" sortKey="acceptRate" className="justify-end" />
								</Suspense>
							) : (
								"정답률"
							)}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{problems.map((problem) => {
						const problemStatus = userProblemStatuses.get(problem.id);
						const isSolved = problemStatus?.solved ?? false;
						const score = problemStatus?.score ?? null;

						return (
							<TableRow key={problem.id}>
								<TableCell className="font-mono text-muted-foreground">{problem.id}</TableCell>
								<TableCell>
									<ProblemTitleCell
										href={`/problems/${problem.id}`}
										title={problem.title}
										problemType={problem.problemType}
										judgeAvailable={problem.judgeAvailable}
										languageRestricted={problem.languageRestricted}
										isPublic={problem.isPublic}
										isSolved={isSolved}
										score={score}
									/>
								</TableCell>
								<TableCell className="text-right text-muted-foreground">
									{problem.submissionCount}
								</TableCell>
								<TableCell className="text-right text-muted-foreground">
									{getAcceptRate(problem.submissionCount, problem.acceptedCount)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
