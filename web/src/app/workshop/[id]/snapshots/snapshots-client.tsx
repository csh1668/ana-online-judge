"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWorkshopSnapshot, rollbackWorkshopSnapshot } from "@/actions/workshop/snapshots";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

type SnapshotRow = {
	id: number;
	label: string;
	message: string | null;
	createdAt: Date | string;
	createdBy: number;
	createdByName: string;
};

export function SnapshotsClient({
	problemId,
	baseSnapshotId,
	initialSnapshots,
}: {
	problemId: number;
	baseSnapshotId: number | null;
	initialSnapshots: SnapshotRow[];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [commitOpen, setCommitOpen] = useState(false);
	const [label, setLabel] = useState("");
	const [message, setMessage] = useState("");
	const [rollbackTarget, setRollbackTarget] = useState<SnapshotRow | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleCommit = () => {
		setError(null);
		if (!label.trim()) {
			setError("라벨을 입력해주세요");
			return;
		}
		startTransition(async () => {
			try {
				await createWorkshopSnapshot(problemId, {
					label: label.trim(),
					message: message.trim() || null,
				});
				setCommitOpen(false);
				setLabel("");
				setMessage("");
				router.refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "커밋 실패");
			}
		});
	};

	const handleRollback = (target: SnapshotRow) => {
		setError(null);
		startTransition(async () => {
			try {
				await rollbackWorkshopSnapshot(problemId, target.id);
				setRollbackTarget(null);
				router.refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "롤백 실패");
			}
		});
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<div>
						<CardTitle>커밋 히스토리</CardTitle>
						<p className="text-xs text-muted-foreground mt-1">
							총 {initialSnapshots.length}개 스냅샷
							{baseSnapshotId !== null && ` · 현재 드래프트 기반 스냅샷 #${baseSnapshotId}`}
						</p>
					</div>
					<Dialog open={commitOpen} onOpenChange={setCommitOpen}>
						<DialogTrigger asChild>
							<Button disabled={isPending}>커밋</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>스냅샷 커밋</DialogTitle>
								<DialogDescription>
									현재 드래프트 상태를 새 스냅샷으로 저장합니다. 동일한 내용의 파일은 자동으로 중복
									제거됩니다.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-3">
								<div>
									<Label htmlFor="snapshot-label">라벨 *</Label>
									<Input
										id="snapshot-label"
										value={label}
										onChange={(e) => setLabel(e.target.value)}
										placeholder="예: v1 제출용"
										disabled={isPending}
									/>
								</div>
								<div>
									<Label htmlFor="snapshot-message">메시지 (선택)</Label>
									<Textarea
										id="snapshot-message"
										value={message}
										onChange={(e) => setMessage(e.target.value)}
										placeholder="테스트 10개 추가 + 솔루션 리팩터링"
										rows={3}
										disabled={isPending}
									/>
								</div>
								{error && <p className="text-sm text-destructive">{error}</p>}
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setCommitOpen(false)} disabled={isPending}>
									취소
								</Button>
								<Button onClick={handleCommit} disabled={isPending || !label.trim()}>
									{isPending ? "커밋 중…" : "커밋"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</CardHeader>
				<CardContent>
					{initialSnapshots.length === 0 ? (
						<div className="text-center text-sm text-muted-foreground py-12">
							아직 스냅샷이 없습니다. "커밋" 버튼으로 현재 상태를 스냅샷할 수 있습니다.
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>ID</TableHead>
									<TableHead>라벨</TableHead>
									<TableHead>메시지</TableHead>
									<TableHead>작성자</TableHead>
									<TableHead>생성일</TableHead>
									<TableHead className="text-right">작업</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{initialSnapshots.map((s) => (
									<TableRow key={s.id}>
										<TableCell className="font-mono text-xs">#{s.id}</TableCell>
										<TableCell>
											<Link
												href={`/workshop/${problemId}/snapshots/${s.id}`}
												className="underline-offset-4 hover:underline font-medium"
											>
												{s.label}
											</Link>
											{baseSnapshotId === s.id && (
												<span className="ml-2 text-xs text-primary">(현재 기반)</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm max-w-xs truncate">
											{s.message ?? "—"}
										</TableCell>
										<TableCell className="text-sm">{s.createdByName}</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{new Date(s.createdAt).toLocaleString("ko-KR")}
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setRollbackTarget(s)}
												disabled={isPending}
											>
												롤백
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<AlertDialog
				open={rollbackTarget !== null}
				onOpenChange={(open) => !open && setRollbackTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>스냅샷으로 롤백하시겠습니까?</AlertDialogTitle>
						<AlertDialogDescription>
							{rollbackTarget && (
								<>
									<span className="font-medium text-foreground">#{rollbackTarget.id}</span>{" "}
									<span>({rollbackTarget.label})</span>로 드래프트를 되돌립니다.
									<br />
									<br />
									롤백 직전 상태는 자동으로{" "}
									<code className="text-xs">auto/롤백 전 — {rollbackTarget.label}</code> 라벨로
									스냅샷됩니다. 언제든 되돌릴 수 있습니다.
									<br />
									<br />
									<span className="text-destructive">
										현재 편집 중인 커밋되지 않은 변경사항은 자동 스냅샷에 포함된 뒤 덮어씌워집니다.
									</span>
									{error && <p className="text-sm text-destructive mt-2">{error}</p>}
								</>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								if (rollbackTarget) handleRollback(rollbackTarget);
							}}
							disabled={isPending}
						>
							{isPending ? "롤백 중…" : "롤백"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
