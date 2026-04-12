"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { deleteEntry, deleteFolderRecursive } from "@/actions/file-manager";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeleteConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	target: { key: string; isFolder: boolean } | null;
	onDeleted: () => void;
}

export function DeleteConfirmDialog({
	open,
	onOpenChange,
	target,
	onDeleted,
}: DeleteConfirmDialogProps) {
	const [loading, setLoading] = useState(false);

	const handleDelete = useCallback(async () => {
		if (!target) return;
		setLoading(true);
		try {
			if (target.isFolder) {
				const count = await deleteFolderRecursive(target.key);
				toast.success(`폴더와 ${count}개의 파일이 삭제되었습니다.`);
			} else {
				await deleteEntry(target.key);
				toast.success("파일이 삭제되었습니다.");
			}
			onOpenChange(false);
			onDeleted();
		} catch {
			toast.error("삭제에 실패했습니다.");
		} finally {
			setLoading(false);
		}
	}, [target, onOpenChange, onDeleted]);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{target?.isFolder ? "폴더 삭제" : "파일 삭제"}</AlertDialogTitle>
					<AlertDialogDescription>
						{target?.isFolder
							? "이 폴더와 하위의 모든 파일이 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
							: "이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."}
						{target && <span className="mt-2 block font-medium text-foreground">{target.key}</span>}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={loading}>취소</AlertDialogCancel>
					<Button variant="destructive" onClick={handleDelete} disabled={loading}>
						{loading ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								삭제 중...
							</>
						) : (
							"삭제"
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
