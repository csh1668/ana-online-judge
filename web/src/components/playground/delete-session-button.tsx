"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deletePlaygroundSession } from "@/actions/playground";
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

export function DeleteSessionButton({
	sessionId,
	userId,
	name,
}: {
	sessionId: string;
	userId: number;
	name: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	function onConfirm() {
		startTransition(async () => {
			try {
				await deletePlaygroundSession(sessionId, userId);
				toast.success("세션이 삭제되었습니다");
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
				<Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} title="세션 삭제">
					<Trash2 className="h-4 w-4 text-destructive" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent onClick={(e) => e.stopPropagation()}>
				<AlertDialogHeader>
					<AlertDialogTitle>세션을 삭제할까요?</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							<p>
								<span className="font-medium">{name}</span> 세션과 모든 파일이 영구적으로
								삭제됩니다.
							</p>
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
