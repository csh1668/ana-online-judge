"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	type DeadLetterEntry,
	deleteDeadLetterJobAction,
	requeueDeadLetterJobAction,
} from "@/actions/admin/dlq";
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
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DeadLetterTable({ entries }: { entries: DeadLetterEntry[] }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [deleteTarget, setDeleteTarget] = useState<DeadLetterEntry | null>(null);

	const handleRequeue = (entry: DeadLetterEntry) => {
		startTransition(async () => {
			try {
				const result = await requeueDeadLetterJobAction(entry.index, entry.fingerprint);
				if (result.ok) {
					toast.success("채점 큐 앞으로 재큐되었습니다.");
					router.refresh();
				} else {
					toast.error(result.error);
				}
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "재큐 실패");
			}
		});
	};

	const handleDelete = (entry: DeadLetterEntry) => {
		startTransition(async () => {
			try {
				const result = await deleteDeadLetterJobAction(entry.index, entry.fingerprint);
				if (result.ok) {
					toast.success("삭제되었습니다.");
					router.refresh();
				} else {
					toast.error(result.error);
				}
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "삭제 실패");
			} finally {
				setDeleteTarget(null);
			}
		});
	};

	if (entries.length === 0) {
		return (
			<div className="text-center py-12 text-muted-foreground">Dead Letter 큐가 비어 있습니다.</div>
		);
	}

	return (
		<div className="rounded-md border">
			<Table className="min-w-[960px]">
				<TableHeader>
					<TableRow>
						<TableHead className="w-[50px]">#</TableHead>
						<TableHead className="w-[150px]">타입</TableHead>
						<TableHead className="w-[90px]">제출</TableHead>
						<TableHead className="w-[90px]">문제</TableHead>
						<TableHead className="w-[90px]">크기</TableHead>
						<TableHead>Payload</TableHead>
						<TableHead className="w-[170px]">액션</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{entries.map((entry) => (
						<TableRow key={entry.fingerprint}>
							<TableCell className="font-mono text-xs">{entry.index}</TableCell>
							<TableCell className="font-mono text-xs">{entry.jobType}</TableCell>
							<TableCell>
								{entry.submissionId !== null ? (
									<Link
										href={`/submissions/${entry.submissionId}`}
										className="text-accent hover:underline font-mono text-xs"
									>
										#{entry.submissionId}
									</Link>
								) : (
									<span className="text-muted-foreground text-xs">—</span>
								)}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{entry.problemId !== null ? entry.problemId : "—"}
							</TableCell>
							<TableCell className="font-mono text-xs">{formatBytes(entry.sizeBytes)}</TableCell>
							<TableCell>
								<div className="block truncate font-mono text-xs" title={entry.preview}>
									{entry.preview}
								</div>
							</TableCell>
							<TableCell>
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										variant="outline"
										disabled={pending}
										onClick={() => handleRequeue(entry)}
									>
										재큐
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={pending}
										className="text-destructive"
										onClick={() => setDeleteTarget(entry)}
									>
										삭제
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(next) => !next && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Dead job 삭제 확인</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-1">
								<p>
									{deleteTarget?.jobType} job
									{deleteTarget?.submissionId !== null && deleteTarget !== null
										? ` (제출 #${deleteTarget.submissionId})`
										: ""}
									을(를) 영구 삭제합니다.
								</p>
								<p className="text-xs text-muted-foreground">
									• payload가 큐에서 제거되며 이 작업은 되돌릴 수 없습니다.
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => deleteTarget && handleDelete(deleteTarget)}
							disabled={pending}
							className="bg-destructive hover:bg-destructive/90"
						>
							{pending ? "삭제 중..." : "삭제"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
