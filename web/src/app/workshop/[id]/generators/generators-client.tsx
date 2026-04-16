"use client";

import Editor from "@monaco-editor/react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteWorkshopGenerator,
	getWorkshopGeneratorTemplate,
	readWorkshopGeneratorSource,
	saveWorkshopGeneratorSource,
	uploadWorkshopGenerator,
} from "@/actions/workshop/generators";
import { Badge } from "@/components/ui/badge";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const LANGUAGES = [
	{ value: "c", label: "C" },
	{ value: "cpp", label: "C++" },
	{ value: "python", label: "Python" },
	{ value: "java", label: "Java" },
	{ value: "rust", label: "Rust" },
	{ value: "go", label: "Go" },
	{ value: "javascript", label: "JavaScript" },
] as const;

function monacoLanguage(lang: string): string {
	switch (lang) {
		case "cpp":
		case "c":
			return "cpp";
		case "python":
			return "python";
		case "java":
			return "java";
		case "rust":
			return "rust";
		case "go":
			return "go";
		case "javascript":
			return "javascript";
		default:
			return "plaintext";
	}
}

type Row = {
	id: number;
	name: string;
	language: string;
	updatedAt: string;
};

export function GeneratorsClient({ problemId, initial }: { problemId: number; initial: Row[] }) {
	const [rows, setRows] = useState<Row[]>(initial);
	const [uploadOpen, setUploadOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Row | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

	useEffect(() => setRows(initial), [initial]);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button onClick={() => setUploadOpen(true)}>
					<Plus className="h-4 w-4 mr-1" />
					제너레이터 업로드
				</Button>
			</div>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					제너레이터가 없습니다. 위의 버튼으로 업로드하세요.
				</p>
			) : (
				<ul className="divide-y border rounded">
					{rows.map((r) => (
						<li key={r.id} className="flex items-center justify-between px-4 py-2">
							<div className="flex-1 min-w-0">
								<div className="font-mono text-sm truncate">{r.name}</div>
								<div className="text-xs text-muted-foreground">
									<Badge variant="outline" className="mr-2">
										{r.language}
									</Badge>
									업데이트: {new Date(r.updatedAt).toLocaleString("ko-KR")}
								</div>
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setEditTarget(r)}
									title="소스 편집"
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

			<UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} problemId={problemId} />
			{editTarget && (
				<EditDialog problemId={problemId} row={editTarget} onClose={() => setEditTarget(null)} />
			)}
			{deleteTarget && (
				<DeleteDialog
					problemId={problemId}
					row={deleteTarget}
					onClose={() => setDeleteTarget(null)}
				/>
			)}
		</div>
	);
}

function UploadDialog({
	open,
	onOpenChange,
	problemId,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
}) {
	const [name, setName] = useState("");
	const [language, setLanguage] = useState<string>("cpp");
	const [mode, setMode] = useState<"file" | "inline">("file");
	const [file, setFile] = useState<File | null>(null);
	const [inlineSource, setInlineSource] = useState<string>("");
	const [pending, startTransition] = useTransition();
	const [templatePending, setTemplatePending] = useState(false);

	function reset() {
		setName("");
		setFile(null);
		setLanguage("cpp");
		setMode("file");
		setInlineSource("");
	}

	async function loadTemplate(template: "cpp" | "python") {
		if (inlineSource.trim().length > 0) {
			const ok = window.confirm("현재 입력된 소스를 템플릿으로 덮어쓸까요?");
			if (!ok) return;
		}
		setTemplatePending(true);
		try {
			const { content } = await getWorkshopGeneratorTemplate(template);
			setInlineSource(content);
			// Auto-select matching language so the user doesn't trip over a mismatch.
			setLanguage(template);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "템플릿을 불러오지 못했습니다");
		} finally {
			setTemplatePending(false);
		}
	}

	function extensionFor(lang: string): string {
		switch (lang) {
			case "cpp":
				return "cpp";
			case "c":
				return "c";
			case "python":
				return "py";
			case "java":
				return "java";
			case "rust":
				return "rs";
			case "go":
				return "go";
			case "javascript":
				return "js";
			default:
				return "txt";
		}
	}

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			toast.error("이름을 입력해주세요");
			return;
		}
		const fd = new FormData();
		fd.append("name", name.trim());
		fd.append("language", language);
		if (mode === "file") {
			if (!file) {
				toast.error("소스 파일을 선택해주세요");
				return;
			}
			fd.append("file", file);
		} else {
			if (!inlineSource.trim()) {
				toast.error("소스 코드를 입력해주세요");
				return;
			}
			const filename = `${name.trim()}.${extensionFor(language)}`;
			const blob = new File([inlineSource], filename, { type: "text/plain" });
			fd.append("file", blob);
		}
		startTransition(async () => {
			try {
				await uploadWorkshopGenerator(problemId, fd);
				toast.success("업로드되었습니다");
				reset();
				onOpenChange(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "업로드 실패");
			}
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v) reset();
				onOpenChange(v);
			}}
		>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>제너레이터 업로드</DialogTitle>
					<DialogDescription>
						테스트 입력을 생성하는 프로그램을 업로드합니다. 마지막 인자로 seed(hex)가 자동
						전달됩니다.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<Label htmlFor="gname">이름</Label>
						<Input
							id="gname"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="예: gen-random"
							disabled={pending}
						/>
					</div>
					<div>
						<Label>언어</Label>
						<Select value={language} onValueChange={setLanguage} disabled={pending}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{LANGUAGES.map((l) => (
									<SelectItem key={l.value} value={l.value}>
										{l.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<Label>입력 방식</Label>
						<div className="flex gap-2 mt-1">
							<Button
								type="button"
								size="sm"
								variant={mode === "file" ? "default" : "outline"}
								onClick={() => setMode("file")}
								disabled={pending}
							>
								파일 업로드
							</Button>
							<Button
								type="button"
								size="sm"
								variant={mode === "inline" ? "default" : "outline"}
								onClick={() => setMode("inline")}
								disabled={pending}
							>
								직접 입력
							</Button>
						</div>
					</div>
					{mode === "file" ? (
						<div>
							<Label htmlFor="gfile">소스 파일</Label>
							<Input
								id="gfile"
								type="file"
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
								disabled={pending}
							/>
						</div>
					) : (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>소스 코드</Label>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => loadTemplate("cpp")}
										disabled={pending || templatePending}
										title="C++ 시작 템플릿(testlib.h)을 삽입합니다"
									>
										C++ 템플릿
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => loadTemplate("python")}
										disabled={pending || templatePending}
										title="Python 시작 템플릿(argparse)을 삽입합니다"
									>
										Python 템플릿
									</Button>
								</div>
							</div>
							<div className="h-[40vh] border rounded overflow-hidden">
								<Editor
									height="100%"
									value={inlineSource}
									language={monacoLanguage(language)}
									theme="vs-dark"
									options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
									onChange={(v) => setInlineSource(v ?? "")}
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								마지막 인자로 seed(hex)가 자동 전달됩니다.
							</p>
						</div>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={pending}
						>
							취소
						</Button>
						<Button
							type="submit"
							disabled={pending || !name.trim() || (mode === "file" ? !file : !inlineSource.trim())}
						>
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

function EditDialog({
	problemId,
	row,
	onClose,
}: {
	problemId: number;
	row: Row;
	onClose: () => void;
}) {
	const [state, setState] = useState<
		| { status: "loading" }
		| { status: "ready"; content: string }
		| { status: "error"; message: string }
	>({ status: "loading" });
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const { content } = await readWorkshopGeneratorSource(problemId, row.id);
				if (!cancelled) setState({ status: "ready", content });
			} catch (err) {
				if (!cancelled) {
					setState({
						status: "error",
						message: err instanceof Error ? err.message : "불러오지 못했습니다",
					});
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [problemId, row.id]);

	function onSave() {
		if (state.status !== "ready") return;
		const content = state.content;
		startTransition(async () => {
			try {
				await saveWorkshopGeneratorSource(problemId, row.id, content);
				toast.success("저장되었습니다");
				onClose();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장 실패");
			}
		});
	}

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle className="font-mono">
						{row.name}.{row.language}
					</DialogTitle>
				</DialogHeader>
				<div className="h-[60vh] border rounded overflow-hidden">
					{state.status === "loading" && (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							<Loader2 className="h-4 w-4 animate-spin mr-2" />
							불러오는 중...
						</div>
					)}
					{state.status === "error" && (
						<div className="flex items-center justify-center h-full text-destructive text-sm">
							{state.message}
						</div>
					)}
					{state.status === "ready" && (
						<Editor
							height="100%"
							value={state.content}
							language={monacoLanguage(row.language)}
							theme="vs-dark"
							options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
							onChange={(v) => setState({ status: "ready", content: v ?? "" })}
						/>
					)}
				</div>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
						취소
					</Button>
					<Button type="button" onClick={onSave} disabled={pending || state.status !== "ready"}>
						{pending ? "저장 중..." : "저장"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteDialog({
	problemId,
	row,
	onClose,
}: {
	problemId: number;
	row: Row;
	onClose: () => void;
}) {
	const [pending, startTransition] = useTransition();
	function onConfirm() {
		startTransition(async () => {
			try {
				await deleteWorkshopGenerator(problemId, row.id);
				toast.success("삭제되었습니다");
				onClose();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "삭제 실패");
			}
		});
	}
	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>제너레이터 삭제</DialogTitle>
					<DialogDescription>
						{row.name}을(를) 삭제합니다. 이 제너레이터를 참조하는 스크립트 줄은 실행할 수 없게
						됩니다.
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
