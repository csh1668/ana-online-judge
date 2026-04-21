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
import type { ProblemTableSort } from "@/lib/services/problem-list-sort";

export interface ProblemListRow {
	id: number;
	title: string;
	problemType: ProblemType;
	judgeAvailable: boolean;
	languageRestricted: boolean;
	hasSubtasks?: boolean;
	isPublic: boolean;
	submissionCount: number;
	acceptedCount: number;
	solverCount: number;
	tier: number;
}

interface Props {
	problems: ProblemListRow[];
	userProblemStatuses: Map<number, { solved: boolean; score: number | null }>;
	sortable?: boolean;
	emptyLabel?: string;
	// 출처 상세 페이지 등에서 DB id 대신 출처 내 문제 번호를 표시할 때 사용한다.
	problemNumberById?: Map<number, string | null>;
	numberColumnLabel?: string;
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
	problemNumberById,
	numberColumnLabel,
}: Props) {
	if (problems.length === 0) {
		return <div className="text-center py-12 text-muted-foreground">{emptyLabel}</div>;
	}

	const headerLabel = numberColumnLabel ?? "#";

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[80px]">
							{sortable ? (
								<Suspense fallback={headerLabel}>
									<SortableHeader<ProblemTableSort> label={headerLabel} sortKey="id" />
								</Suspense>
							) : (
								headerLabel
							)}
						</TableHead>
						<TableHead>
							{sortable ? (
								<Suspense fallback="제목">
									<SortableHeader<ProblemTableSort> label="제목" sortKey="title" />
								</Suspense>
							) : (
								"제목"
							)}
						</TableHead>
						<TableHead className="w-[100px] text-right">
							{sortable ? (
								<Suspense fallback="제출">
									<SortableHeader<ProblemTableSort>
										label="제출"
										sortKey="submissionCount"
										className="justify-end"
									/>
								</Suspense>
							) : (
								"제출"
							)}
						</TableHead>
						<TableHead className="w-[100px] text-right">
							{sortable ? (
								<Suspense fallback="정답자">
									<SortableHeader<ProblemTableSort>
										label="정답자"
										sortKey="solverCount"
										className="justify-end"
									/>
								</Suspense>
							) : (
								"정답자"
							)}
						</TableHead>
						<TableHead className="w-[100px] text-right">
							{sortable ? (
								<Suspense fallback="정답률">
									<SortableHeader<ProblemTableSort>
										label="정답률"
										sortKey="acceptRate"
										className="justify-end"
									/>
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
						const overrideNumber = problemNumberById?.get(problem.id);
						const numberCell =
							overrideNumber && overrideNumber.trim() !== "" ? overrideNumber : problem.id;

						return (
							<TableRow key={problem.id}>
								<TableCell className="font-mono text-muted-foreground">{numberCell}</TableCell>
								<TableCell>
									<ProblemTitleCell
										href={`/problems/${problem.id}`}
										title={problem.title}
										problemType={problem.problemType}
										judgeAvailable={problem.judgeAvailable}
										languageRestricted={problem.languageRestricted}
										hasSubtasks={problem.hasSubtasks}
										isPublic={problem.isPublic}
										isSolved={isSolved}
										score={score}
										tier={problem.tier}
									/>
								</TableCell>
								<TableCell className="text-right text-muted-foreground">
									{problem.submissionCount}
								</TableCell>
								<TableCell className="text-right text-muted-foreground">
									{problem.solverCount}
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
