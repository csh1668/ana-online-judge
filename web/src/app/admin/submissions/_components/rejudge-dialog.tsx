"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { RejudgeResult } from "@/actions/admin/submissions";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function RejudgeDialog({
	open,
	count,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	count: number;
	onCancel: () => void;
	onConfirm: () => Promise<RejudgeResult>;
}) {
	const [pending, startTransition] = useTransition();
	const [busy, setBusy] = useState(false);

	const handleConfirm = () => {
		setBusy(true);
		startTransition(async () => {
			try {
				const result = await onConfirm();
				const skippedCount = result.skipped.length;
				toast.success(
					skippedCount > 0
						? `${result.enqueued}건 재채점 큐에 등록됨. (건너뜀: ${skippedCount}건)`
						: `${result.enqueued}건 재채점 큐에 등록됨.`
				);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "재채점 실패");
			} finally {
				setBusy(false);
				onCancel();
			}
		});
	};

	return (
		<AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>재채점 확인</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-1">
							<p>총 {count}건의 제출을 재채점합니다.</p>
							<p className="text-xs text-muted-foreground">
								• 기존 채점 결과는 사라지며 다시 채점이 진행됩니다.
							</p>
							<p className="text-xs text-muted-foreground">
								• Anigma 제출 / 진행 중인 제출은 자동으로 건너뜁니다.
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending || busy}>취소</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm} disabled={pending || busy}>
						{pending || busy ? "처리 중..." : "재채점"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
