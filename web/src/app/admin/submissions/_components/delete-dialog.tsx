"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { DeleteResult } from "@/actions/admin/submissions";
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

export function DeleteDialog({
	open,
	count,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	count: number;
	onCancel: () => void;
	onConfirm: () => Promise<DeleteResult>;
}) {
	const [pending, startTransition] = useTransition();
	const [busy, setBusy] = useState(false);

	const handleConfirm = () => {
		setBusy(true);
		startTransition(async () => {
			try {
				const result = await onConfirm();
				if (result.deleted === 0) {
					toast.info(
						result.skipped > 0
							? `삭제할 제출을 찾을 수 없습니다. (찾을 수 없음: ${result.skipped}건)`
							: "삭제할 제출이 없습니다."
					);
					return;
				}
				toast.success(
					result.skipped > 0
						? `${result.deleted}건 삭제됨. (찾을 수 없음: ${result.skipped}건)`
						: `${result.deleted}건 삭제됨.`
				);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "삭제 실패");
			} finally {
				setBusy(false);
				onCancel();
			}
		});
	};

	return (
		<AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>제출 삭제 확인</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-1">
							<p>총 {count}건의 제출을 삭제합니다.</p>
							<p className="text-xs text-muted-foreground">
								• 제출 기록과 채점 결과가 영구 삭제됩니다.
							</p>
							<p className="text-xs text-muted-foreground">• 이 작업은 되돌릴 수 없습니다.</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending || busy}>취소</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						disabled={pending || busy}
						className="bg-destructive hover:bg-destructive/90"
					>
						{pending || busy ? "삭제 중..." : "삭제"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
