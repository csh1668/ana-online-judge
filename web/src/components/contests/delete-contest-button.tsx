"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteContest } from "@/actions/contests";
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

export function DeleteContestButton({ contestId }: { contestId: number }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [open, setOpen] = useState(false);

	function handleDelete() {
		startTransition(async () => {
			try {
				await deleteContest(contestId);
				setOpen(false);
				router.push("/admin/contests");
			} catch (error) {
				console.error("Failed to delete contest:", error);
				alert("대회 삭제 중 오류가 발생했습니다.");
			}
		});
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">
					<Trash2 className="mr-2 h-4 w-4" />
					대회 삭제
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>대회를 삭제하시겠습니까?</AlertDialogTitle>
					<AlertDialogDescription>
						이 작업은 되돌릴 수 없습니다. 대회의 모든 데이터(문제, 참가자, 제출 기록 등)가
						영구적으로 삭제됩니다.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>취소</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e) => {
							e.preventDefault();
							handleDelete();
						}}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						disabled={isPending}
					>
						{isPending ? "삭제 중..." : "삭제"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
