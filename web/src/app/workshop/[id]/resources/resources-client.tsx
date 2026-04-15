"use client";

import Editor from "@monaco-editor/react";
import { Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteWorkshopResource,
	readWorkshopResourceText,
	renameWorkshopResource,
	uploadWorkshopResource,
} from "@/actions/workshop/resources";
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

type Row = {
	id: number;
	name: string;
	updatedAt: string;
};

type Props = {
	problemId: number;
	initialResources: Row[];
};

export function ResourcesClient({ problemId, initialResources }: Props) {
	const [rows, setRows] = useState<Row[]>(initialResources);
	const [uploadOpen, setUploadOpen] = useState(false);
	const [renameTarget, setRenameTarget] = useState<Row | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
	const [previewTarget, setPreviewTarget] = useState<Row | null>(null);

	useEffect(() => setRows(initialResources), [initialResources]);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button onClick={() => setUploadOpen(true)}>
					<Plus className="h-4 w-4 mr-1" />
					리소스 업로드
				</Button>
			</div>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					리소스가 없습니다. testlib.h가 삭제된 경우 다시 업로드해주세요.
				</p>
			) : (
				<ul className="divide-y border rounded">
					{rows.map((r) => (
						<li key={r.id} className="flex items-center justify-between px-4 py-2">
							<div className="flex-1 min-w-0">
								<div className="font-mono text-sm truncate">{r.name}</div>
								<div className="text-xs text-muted-foreground">
									업데이트: {new Date(r.updatedAt).toLocaleString("ko-KR")}
								</div>
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setPreviewTarget(r)}
									title="미리보기"
								>
									<Eye className="h-4 w-4" />
								</Button>
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

			<UploadResourceDialog open={uploadOpen} onOpenChange={setUploadOpen} problemId={problemId} />
			{renameTarget && (
				<RenameResourceDialog
					problemId={problemId}
					resource={renameTarget}
					onClose={() => setRenameTarget(null)}
				/>
			)}
			{deleteTarget && (
				<DeleteResourceDialog
					problemId={problemId}
					resource={deleteTarget}
					onClose={() => setDeleteTarget(null)}
				/>
			)}
			{previewTarget && (
				<PreviewResourceDialog
					problemId={problemId}
					resource={previewTarget}
					onClose={() => setPreviewTarget(null)}
				/>
			)}
		</div>
	);
}

function UploadResourceDialog({
	open,
	onOpenChange,
	problemId,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState("");
	const [pending, startTransition] = useTransition();
	const fileRef = useRef<HTMLInputElement>(null);

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!file) {
			toast.error("파일을 선택해주세요");
			return;
		}
		const fd = new FormData();
		fd.append("name", (name || file.name).trim());
		fd.append("file", file);
		startTransition(async () => {
			try {
				await uploadWorkshopResource(problemId, fd);
				toast.success("업로드되었습니다");
				onOpenChange(false);
				setFile(null);
				setName("");
				if (fileRef.current) fileRef.current.value = "";
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "업로드에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>리소스 업로드</DialogTitle>
					<DialogDescription>
						공용 헤더/모듈 파일을 업로드합니다. 같은 이름의 파일은 덮어쓰여집니다.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<Label>파일</Label>
						<Input
							ref={fileRef}
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
						<Label htmlFor="resName">저장할 파일명</Label>
						<Input
							id="resName"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="예: jngen.h"
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

function RenameResourceDialog({
	problemId,
	resource,
	onClose,
}: {
	problemId: number;
	resource: Row;
	onClose: () => void;
}) {
	const [name, setName] = useState(resource.name);
	const [pending, startTransition] = useTransition();
	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		startTransition(async () => {
			try {
				await renameWorkshopResource(problemId, resource.id, name.trim());
				toast.success("이름이 변경되었습니다");
				onClose();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "이름 변경에 실패했습니다");
			}
		});
	}
	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>리소스 이름 변경</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<Label htmlFor="newName">새 파일명</Label>
						<Input
							id="newName"
							value={name}
							onChange={(e) => setName(e.target.value)}
							disabled={pending}
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
							취소
						</Button>
						<Button type="submit" disabled={pending || !name.trim() || name === resource.name}>
							{pending ? "변경 중..." : "변경"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteResourceDialog({
	problemId,
	resource,
	onClose,
}: {
	problemId: number;
	resource: Row;
	onClose: () => void;
}) {
	const [pending, startTransition] = useTransition();
	function onConfirm() {
		startTransition(async () => {
			try {
				await deleteWorkshopResource(problemId, resource.id);
				toast.success("삭제되었습니다");
				onClose();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
			}
		});
	}
	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>리소스 삭제</DialogTitle>
					<DialogDescription>
						{resource.name}을(를) 삭제합니다. 이 파일을 참조하는 제너레이터/체커는 컴파일 실패할 수
						있습니다.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
						취소
					</Button>
					<Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
						{pending ? "삭제 중..." : "삭제"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function PreviewResourceDialog({
	problemId,
	resource,
	onClose,
}: {
	problemId: number;
	resource: Row;
	onClose: () => void;
}) {
	const [state, setState] = useState<
		| { status: "loading" }
		| { status: "text"; content: string }
		| { status: "binary" }
		| { status: "error"; message: string }
	>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const result = await readWorkshopResourceText(problemId, resource.id);
				if (cancelled) return;
				if (result.binary) {
					setState({ status: "binary" });
				} else {
					setState({ status: "text", content: result.text ?? "" });
				}
			} catch (err) {
				if (cancelled) return;
				setState({
					status: "error",
					message: err instanceof Error ? err.message : "불러오지 못했습니다",
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [problemId, resource.id]);

	const language = inferLanguageFromName(resource.name);

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle className="font-mono">{resource.name}</DialogTitle>
				</DialogHeader>
				<div className="h-[60vh] border rounded overflow-hidden">
					{state.status === "loading" && (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							<Loader2 className="h-4 w-4 animate-spin mr-2" />
							불러오는 중...
						</div>
					)}
					{state.status === "binary" && (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							바이너리 파일은 미리보기를 지원하지 않습니다
						</div>
					)}
					{state.status === "error" && (
						<div className="flex items-center justify-center h-full text-destructive text-sm">
							{state.message}
						</div>
					)}
					{state.status === "text" && (
						<Editor
							height="100%"
							value={state.content}
							language={language}
							theme="vs-dark"
							options={{
								readOnly: true,
								minimap: { enabled: false },
								wordWrap: "on",
								fontSize: 13,
							}}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function inferLanguageFromName(name: string): string {
	const ext = name.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "h":
		case "hpp":
		case "cpp":
		case "cc":
		case "cxx":
			return "cpp";
		case "c":
			return "c";
		case "py":
			return "python";
		case "rs":
			return "rust";
		case "go":
			return "go";
		case "js":
			return "javascript";
		case "ts":
			return "typescript";
		case "java":
			return "java";
		case "txt":
		case "md":
			return "plaintext";
		default:
			return "plaintext";
	}
}
