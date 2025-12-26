"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addProblemToContest, removeProblemFromContest } from "@/actions/contests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface ContestProblem {
	id: number;
	label: string;
	problem: {
		id: number;
		title: string;
		problemType: string;
		maxScore: number;
	};
}

interface ContestProblemManagerProps {
	contestId: number;
	problems: ContestProblem[];
}

export function ContestProblemManager({ contestId, problems }: ContestProblemManagerProps) {
	const router = useRouter();
	const { toast } = useToast();
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const [newProblem, setNewProblem] = useState({
		problemId: "",
		label: "",
	});

	const handleAddProblem = async () => {
		if (!newProblem.problemId || !newProblem.label) {
			toast({
				title: "입력 오류",
				description: "문제 ID와 번호를 모두 입력해주세요.",
				variant: "destructive",
			});
			return;
		}

		setIsSubmitting(true);
		try {
			await addProblemToContest({
				contestId,
				problemId: Number.parseInt(newProblem.problemId, 10),
				label: newProblem.label,
			});

			toast({
				title: "성공",
				description: "문제가 추가되었습니다.",
			});

			setIsAddDialogOpen(false);
			setNewProblem({ problemId: "", label: "" });
			router.refresh();
		} catch (error) {
			toast({
				title: "오류",
				description: error instanceof Error ? error.message : "문제 추가 중 오류가 발생했습니다.",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleRemoveProblem = async (contestProblemId: number) => {
		if (!confirm("정말 이 문제를 대회에서 제거하시겠습니까?")) {
			return;
		}

		try {
			await removeProblemFromContest(contestProblemId, contestId);
			toast({
				title: "성공",
				description: "문제가 제거되었습니다.",
			});
			router.refresh();
		} catch (error) {
			toast({
				title: "오류",
				description: error instanceof Error ? error.message : "문제 제거 중 오류가 발생했습니다.",
				variant: "destructive",
			});
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />
							문제 추가
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>문제 추가</DialogTitle>
							<DialogDescription>대회에 추가할 문제의 ID와 번호를 입력하세요.</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<Label htmlFor="problemId">문제 ID</Label>
								<Input
									id="problemId"
									type="number"
									placeholder="1"
									value={newProblem.problemId}
									onChange={(e) => setNewProblem({ ...newProblem, problemId: e.target.value })}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="label">문제 번호 (A, B, C...)</Label>
								<Input
									id="label"
									placeholder="A"
									value={newProblem.label}
									onChange={(e) =>
										setNewProblem({ ...newProblem, label: e.target.value.toUpperCase() })
									}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setIsAddDialogOpen(false)}
								disabled={isSubmitting}
							>
								취소
							</Button>
							<Button onClick={handleAddProblem} disabled={isSubmitting}>
								{isSubmitting ? "추가 중..." : "추가"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{problems.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground">등록된 문제가 없습니다.</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[80px]">번호</TableHead>
								<TableHead>제목</TableHead>
								<TableHead className="w-[120px]">유형</TableHead>
								<TableHead className="w-[100px] text-right">배점</TableHead>
								<TableHead className="w-[120px] text-right">작업</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{problems.map((cp) => (
								<TableRow key={cp.id}>
									<TableCell className="font-mono font-bold">{cp.label}</TableCell>
									<TableCell className="font-medium">{cp.problem.title}</TableCell>
									<TableCell>
										<Badge variant="secondary">{cp.problem.problemType.toUpperCase()}</Badge>
									</TableCell>
									<TableCell className="text-right">{cp.problem.maxScore}</TableCell>
									<TableCell className="text-right">
										<Button variant="ghost" size="sm" onClick={() => handleRemoveProblem(cp.id)}>
											<Trash2 className="h-4 w-4" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
