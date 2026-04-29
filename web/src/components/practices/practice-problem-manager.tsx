"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addProblemToPractice, removeProblemFromPractice } from "@/actions/practices";
import { ProblemPickerDialog } from "@/components/practices/problem-picker-dialog";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ProblemType } from "@/db";
import { useToast } from "@/hooks/use-toast";
import { PRACTICE_MAX_PROBLEMS } from "@/lib/practice-utils";

interface PracticeProblemRow {
	id: number;
	label: string;
	problem: {
		id: number;
		title: string;
		problemType: string;
		maxScore: number;
		judgeAvailable: boolean;
		languageRestricted: boolean;
		hasSubtasks: boolean;
		tier?: number;
	};
}

export function PracticeProblemManager({
	practiceId,
	problems,
}: {
	practiceId: number;
	problems: PracticeProblemRow[];
}) {
	const router = useRouter();
	const { toast } = useToast();
	const [pickerOpen, setPickerOpen] = useState(false);

	async function handleRemove(practiceProblemId: number) {
		if (!confirm("이 문제를 연습에서 제거할까요?")) return;
		try {
			await removeProblemFromPractice(practiceId, practiceProblemId);
			toast({ title: "성공", description: "문제가 제거되었습니다." });
			router.refresh();
		} catch (err) {
			toast({
				title: "오류",
				description: err instanceof Error ? err.message : "제거 중 오류가 발생했습니다",
				variant: "destructive",
			});
		}
	}

	const remainingCapacity = PRACTICE_MAX_PROBLEMS - problems.length;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{problems.length} / {PRACTICE_MAX_PROBLEMS}개 등록됨
				</p>
				<Button onClick={() => setPickerOpen(true)} disabled={remainingCapacity <= 0}>
					<Plus className="mr-2 h-4 w-4" />
					문제 추가
				</Button>
			</div>
			{problems.length === 0 ? (
				<div className="text-center py-8 text-muted-foreground">등록된 문제가 없습니다.</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[60px]">번호</TableHead>
								<TableHead>제목</TableHead>
								<TableHead className="w-[80px] text-right">배점</TableHead>
								<TableHead className="w-[80px] text-right">작업</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{problems.map((p) => (
								<TableRow key={p.id}>
									<TableCell className="font-mono font-bold">{p.label}</TableCell>
									<TableCell>
										<ProblemTitleCell
											href={`/problems/${p.problem.id}`}
											title={p.problem.title}
											problemType={p.problem.problemType as ProblemType}
											judgeAvailable={p.problem.judgeAvailable}
											languageRestricted={p.problem.languageRestricted}
											hasSubtasks={p.problem.hasSubtasks}
											tier={p.problem.tier}
										/>
									</TableCell>
									<TableCell className="text-right">{p.problem.maxScore}</TableCell>
									<TableCell className="text-right">
										<Button variant="ghost" size="sm" onClick={() => handleRemove(p.id)}>
											<Trash2 className="h-4 w-4" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<ProblemPickerDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				mode="multi"
				excludeIds={problems.map((p) => p.problem.id)}
				maxSelect={remainingCapacity}
				title="문제 추가"
				description="연습에 추가할 문제를 검색하여 선택하세요."
				onConfirm={async (picked) => {
					let successCount = 0;
					const errors: string[] = [];
					for (const p of picked) {
						try {
							await addProblemToPractice(practiceId, p.id);
							successCount++;
						} catch (err) {
							errors.push(`${p.id}: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
						}
					}
					if (successCount > 0) {
						toast({
							title: "성공",
							description: `${successCount}개의 문제가 추가되었습니다.`,
						});
					}
					if (errors.length > 0) {
						toast({
							title: "일부 추가 실패",
							description: errors.join("\n"),
							variant: "destructive",
						});
					}
					router.refresh();
				}}
			/>
		</div>
	);
}
