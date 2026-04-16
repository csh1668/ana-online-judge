"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteWorkshopManualInboxFile,
	renameWorkshopManualInboxFile,
	uploadWorkshopManualInboxFile,
} from "@/actions/workshop/manual-inbox";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InboxRow = {
	name: string;
	size: number;
	lastModified: string;
};

export function InboxPanel({ problemId, initial }: { problemId: number; initial: InboxRow[] }) {
	const [rows, setRows] = useState<InboxRow[]>(initial);
	const [uploadOpen, setUploadOpen] = useState(false);
	const [renameTarget, setRenameTarget] = useState<InboxRow | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<InboxRow | null>(null);
	const [pending, startTransition] = useTransition();

	function reload(fn: () => Promise<void>) {
		startTransition(async () => {
			try {
				await fn();
				// Re-route to let revalidatePath() trigger a fresh SSR list next time.
				// For now, just reload the page so the panel re-hydrates.
				if (typeof window !== "undefined") window.location.reload();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "작업 실패");
			}
		});
	}

	return (
		<section className="border rounded p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">수동 인박스</h2>
					<p className="text-xs text-muted-foreground">
						스크립트의 <code className="font-mono">manual</code> 줄은 이 목록을 파일명 오름차순으로
						소비합니다. 순서를 바꾸려면 이름을 변경하세요 (예:{" "}
						<code className="font-mono">01.in</code>, <code className="font-mono">02.in</code>).
					</p>
				</div>
				<Button variant="outline" onClick={() => setUploadOpen(true)} disabled={pending}>
					<Plus className="h-4 w-4 mr-1" />
					인박스 파일 추가
				</Button>
			</div>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">비어 있습니다.</p>
			) : (
				<ul className="divide-y border rounded">
					{rows.map((r, i) => (
						<li key={r.name} className="flex items-center justify-between px-4 py-2">
							<div className="flex-1 min-w-0">
								<div className="font-mono text-sm truncate">
									<span className="text-muted-foreground mr-2">#{i + 1}</span>
									{r.name}
								</div>
								<div className="text-xs text-muted-foreground">
									{r.size.toLocaleString()} bytes &middot;{" "}
									{new Date(r.lastModified).toLocaleString("ko-KR")}
								</div>
							</div>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setRenameTarget(r)}
									title="이름 변경"
								>
									<Pencil className="h-4 w-4" />
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)} title="삭제">
									<Trash2 className="h-4 w-4 text-destructive" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			<UploadInboxDialog
				open={uploadOpen}
				onOpenChange={setUploadOpen}
				problemId={problemId}
				onAdded={(row) =>
					setRows((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
				}
			/>
			{renameTarget && (
				<Dialog open onOpenChange={(v) => !v && setRenameTarget(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>이름 변경</DialogTitle>
							<DialogDescription>파일명 변경으로 FIFO 순서를 조정합니다.</DialogDescription>
						</DialogHeader>
						<RenameInboxForm
							problemId={problemId}
							row={renameTarget}
							onDone={() =>
								reload(async () => {
									setRenameTarget(null);
								})
							}
							onCancel={() => setRenameTarget(null)}
						/>
					</DialogContent>
				</Dialog>
			)}
			{deleteTarget && (
				<Dialog open onOpenChange={(v) => !v && setDeleteTarget(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>인박스 파일 삭제</DialogTitle>
							<DialogDescription>{deleteTarget.name}을(를) 삭제합니다.</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="ghost" onClick={() => setDeleteTarget(null)}>
								취소
							</Button>
							<Button
								variant="destructive"
								onClick={() =>
									reload(async () => {
										await deleteWorkshopManualInboxFile(problemId, deleteTarget.name);
									})
								}
								disabled={pending}
							>
								삭제
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</section>
	);
}

function UploadInboxDialog({
	open,
	onOpenChange,
	problemId,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
	onAdded: (row: InboxRow) => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState("");
	const [pending, startTransition] = useTransition();

	function resetForm() {
		setFile(null);
		setName("");
	}

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!file) {
			toast.error("파일을 선택해주세요");
			return;
		}
		const fd = new FormData();
		fd.append("file", file);
		if (name.trim()) fd.append("name", name.trim());
		startTransition(async () => {
			try {
				const created = await uploadWorkshopManualInboxFile(problemId, fd);
				onAdded(created);
				toast.success("업로드되었습니다");
				resetForm();
				onOpenChange(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "업로드 실패");
			}
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) resetForm();
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>인박스 파일 추가</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<Label>파일</Label>
						<Input
							type="file"
							onChange={(e) => {
								const f = e.target.files?.[0] ?? null;
								setFile(f);
								if (f && !name) setName(f.name);
							}}
							disabled={pending}
						/>
					</div>
					<div>
						<Label>저장할 이름</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="예: 01.in"
							disabled={pending}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={pending}
						>
							취소
						</Button>
						<Button type="submit" disabled={pending || !file}>
							{pending ? (
								<>
									<Loader2 className="h-4 w-4 mr-1 animate-spin" />
									업로드 중...
								</>
							) : (
								"업로드"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function RenameInboxForm({
	problemId,
	row,
	onDone,
	onCancel,
}: {
	problemId: number;
	row: InboxRow;
	onDone: () => void;
	onCancel: () => void;
}) {
	const [name, setName] = useState(row.name);
	const [pending, startTransition] = useTransition();
	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		startTransition(async () => {
			try {
				await renameWorkshopManualInboxFile(problemId, row.name, name.trim());
				toast.success("변경되었습니다");
				onDone();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "변경 실패");
			}
		});
	}
	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div>
				<Label>새 파일명</Label>
				<Input value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
			</div>
			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
					취소
				</Button>
				<Button type="submit" disabled={pending || !name.trim() || name === row.name}>
					{pending ? "변경 중..." : "변경"}
				</Button>
			</DialogFooter>
		</form>
	);
}
