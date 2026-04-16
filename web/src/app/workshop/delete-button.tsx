"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteWorkshopProblem } from "@/actions/workshop/problems";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DeleteWorkshopProblemButton({
	problemId,
	title,
	hasPublished,
}: {
	problemId: number;
	title: string;
	hasPublished: boolean;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	function onConfirm() {
		startTransition(async () => {
			try {
				await deleteWorkshopProblem(problemId);
				toast.success("문제가 삭제되었습니다");
				setOpen(false);
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "삭제 실패");
			}
		});
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} title="문제 삭제">
					<Trash2 className="h-4 w-4 text-destructive" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent onClick={(e) => e.stopPropagation()}>
				<AlertDialogHeader>
					<AlertDialogTitle>창작마당 문제를 삭제할까요?</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							<p>
								<span className="font-medium">{title}</span> 및 관련된 모든 데이터(드래프트, 스냅샷,
								인보케이션, 테스트케이스, 제너레이터, 솔루션, 리소스, 지문 이미지)가 영구
								삭제됩니다.
							</p>
							{hasPublished && (
								<p className="text-sm text-muted-foreground">
									출판된 problem은 영향을 받지 않고 그대로 유지됩니다.
								</p>
							)}
							<p className="text-destructive font-medium">이 작업은 되돌릴 수 없습니다.</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						disabled={pending}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "영구 삭제"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
