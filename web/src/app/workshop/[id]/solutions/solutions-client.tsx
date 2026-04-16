"use client";

import Editor from "@monaco-editor/react";
import { Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createWorkshopSolution,
	deleteWorkshopSolution,
	readWorkshopSolutionSource,
	setWorkshopMainSolution,
	updateWorkshopSolution,
} from "@/actions/workshop/solutions";
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
import { Switch } from "@/components/ui/switch";
import type { Language } from "@/db/schema";
import {
	expectedVerdictLabel,
	type WorkshopExpectedVerdict,
} from "@/lib/workshop/expected-verdict";

type Row = {
	id: number;
	name: string;
	language: Language;
	expectedVerdict: WorkshopExpectedVerdict;
	isMain: boolean;
	updatedAt: string;
};

type Props = {
	problemId: number;
	initialSolutions: Row[];
	testcaseCount: number;
	missingOutputCount: number;
	hasMain: boolean;
};

const LANGUAGES: { value: Language; label: string }[] = [
	{ value: "cpp", label: "C++" },
	{ value: "c", label: "C" },
	{ value: "python", label: "Python" },
	{ value: "java", label: "Java" },
	{ value: "rust", label: "Rust" },
	{ value: "go", label: "Go" },
	{ value: "javascript", label: "JavaScript" },
];

const EXPECTED_VERDICTS: WorkshopExpectedVerdict[] = [
	"accepted",
	"wrong_answer",
	"time_limit",
	"memory_limit",
	"runtime_error",
	"presentation_error",
	"tl_or_ml",
];

function monacoLang(lang: Language): string {
	switch (lang) {
		case "cpp":
			return "cpp";
		case "c":
			return "c";
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
		case "text":
			return "plaintext";
	}
}

export function SolutionsClient({
	problemId,
	initialSolutions,
	testcaseCount,
	missingOutputCount,
	hasMain,
}: Props) {
	const [rows, setRows] = useState<Row[]>(initialSolutions);
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Row | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

	useEffect(() => setRows(initialSolutions), [initialSolutions]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					총 <span className="font-semibold text-foreground">{rows.length}</span>개 · 메인 솔루션{" "}
					{hasMain ? (
						<span className="text-green-600 font-medium">있음</span>
					) : (
						<span className="text-destructive font-medium">없음</span>
					)}{" "}
					· 테스트 {testcaseCount}개 (정답 미생성 {missingOutputCount}개)
				</div>
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="h-4 w-4 mr-1" />
					솔루션 추가
				</Button>
			</div>

			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					등록된 솔루션이 없습니다. 메인 솔루션부터 추가한 뒤 "정답 생성"을 실행하세요.
				</p>
			) : (
				<ul className="divide-y border rounded">
					{rows.map((r) => (
						<li key={r.id} className="flex items-center justify-between px-4 py-3 gap-2">
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-mono text-sm">{r.name}</span>
									{r.isMain && (
										<Badge variant="default" className="gap-1">
											<Star className="h-3 w-3" />
											메인
										</Badge>
									)}
									<Badge variant="secondary">{r.language}</Badge>
									<Badge variant="outline">{expectedVerdictLabel(r.expectedVerdict)}</Badge>
								</div>
								<div className="text-xs text-muted-foreground mt-1">
									업데이트: {new Date(r.updatedAt).toLocaleString("ko-KR")}
								</div>
							</div>
							<div className="flex items-center gap-1">
								{!r.isMain && <SetMainButton problemId={problemId} solutionId={r.id} />}
								<Button variant="ghost" size="sm" onClick={() => setEditTarget(r)} title="편집">
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

			<CreateSolutionDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				problemId={problemId}
				canSetMain={true}
			/>
			{editTarget && (
				<EditSolutionDialog
					problemId={problemId}
					row={editTarget}
					onClose={() => setEditTarget(null)}
				/>
			)}
			{deleteTarget && (
				<DeleteSolutionDialog
					problemId={problemId}
					row={deleteTarget}
					onClose={() => setDeleteTarget(null)}
				/>
			)}
		</div>
	);
}

function SetMainButton({ problemId, solutionId }: { problemId: number; solutionId: number }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	return (
		<Button
			variant="ghost"
			size="sm"
			title="메인으로 설정"
			disabled={pending}
			onClick={() => {
				startTransition(async () => {
					try {
						await setWorkshopMainSolution(problemId, solutionId);
						toast.success("메인 솔루션으로 설정되었습니다");
						router.refresh();
					} catch (err) {
						toast.error(err instanceof Error ? err.message : "설정에 실패했습니다");
					}
				});
			}}
		>
			{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
		</Button>
	);
}

function CreateSolutionDialog({
	open,
	onOpenChange,
	problemId,
	canSetMain,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
	canSetMain: boolean;
}) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [language, setLanguage] = useState<Language>("cpp");
	const [expectedVerdict, setExpectedVerdict] = useState<WorkshopExpectedVerdict>("accepted");
	const [isMain, setIsMain] = useState(false);
	const [source, setSource] = useState("");
	const [pending, startTransition] = useTransition();

	function reset() {
		setName("");
		setLanguage("cpp");
		setExpectedVerdict("accepted");
		setIsMain(false);
		setSource("");
	}

	function onSubmit() {
		if (!name.trim() || !source.trim()) {
			toast.error("이름과 소스를 입력해주세요");
			return;
		}
		startTransition(async () => {
			try {
				await createWorkshopSolution(problemId, {
					name: name.trim(),
					language,
					source,
					expectedVerdict,
					isMain,
				});
				toast.success("추가되었습니다");
				onOpenChange(false);
				reset();
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "추가에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>솔루션 추가</DialogTitle>
					<DialogDescription>소스 코드를 직접 붙여넣거나 입력하세요. 최대 2MB.</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label htmlFor="solName">이름</Label>
						<Input
							id="solName"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="예: main"
							disabled={pending}
						/>
					</div>
					<div>
						<Label htmlFor="solLang">언어</Label>
						<Select
							value={language}
							onValueChange={(v) => setLanguage(v as Language)}
							disabled={pending}
						>
							<SelectTrigger id="solLang">
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
						<Label htmlFor="solExpected">예상 verdict</Label>
						<Select
							value={expectedVerdict}
							onValueChange={(v) => setExpectedVerdict(v as WorkshopExpectedVerdict)}
							disabled={pending}
						>
							<SelectTrigger id="solExpected">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EXPECTED_VERDICTS.map((v) => (
									<SelectItem key={v} value={v}>
										{expectedVerdictLabel(v)} ({v})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-end gap-2">
						<Switch
							id="solMain"
							checked={isMain}
							onCheckedChange={setIsMain}
							disabled={pending || !canSetMain}
						/>
						<Label htmlFor="solMain">메인 솔루션 (정답 생성용)</Label>
					</div>
				</div>
				<div className="h-[50vh] border rounded overflow-hidden">
					<Editor
						height="100%"
						value={source}
						onChange={(v) => setSource(v ?? "")}
						language={monacoLang(language)}
						theme="vs-dark"
						options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
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
					<Button type="button" onClick={onSubmit} disabled={pending}>
						{pending ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								추가 중...
							</>
						) : (
							"추가"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EditSolutionDialog({
	problemId,
	row,
	onClose,
}: {
	problemId: number;
	row: Row;
	onClose: () => void;
}) {
	const router = useRouter();
	const [name, setName] = useState(row.name);
	const [language, setLanguage] = useState<Language>(row.language);
	const [expectedVerdict, setExpectedVerdict] = useState<WorkshopExpectedVerdict>(
		row.expectedVerdict
	);
	const [source, setSource] = useState<string | null>(null);
	const [loadErr, setLoadErr] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const result = await readWorkshopSolutionSource(problemId, row.id);
				if (!cancelled) setSource(result.text);
			} catch (err) {
				if (!cancelled) setLoadErr(err instanceof Error ? err.message : "불러오지 못했습니다");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [problemId, row.id]);

	function onSubmit() {
		if (!name.trim()) {
			toast.error("이름을 입력해주세요");
			return;
		}
		startTransition(async () => {
			try {
				const payload: Parameters<typeof updateWorkshopSolution>[2] = {};
				if (name.trim() !== row.name) payload.name = name.trim();
				if (language !== row.language) payload.language = language;
				if (expectedVerdict !== row.expectedVerdict) payload.expectedVerdict = expectedVerdict;
				if (source !== null) payload.source = source;
				await updateWorkshopSolution(problemId, row.id, payload);
				toast.success("저장되었습니다");
				onClose();
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>솔루션 편집</DialogTitle>
				</DialogHeader>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<Label htmlFor="editName">이름</Label>
						<Input
							id="editName"
							value={name}
							onChange={(e) => setName(e.target.value)}
							disabled={pending}
						/>
					</div>
					<div>
						<Label htmlFor="editLang">언어</Label>
						<Select
							value={language}
							onValueChange={(v) => setLanguage(v as Language)}
							disabled={pending}
						>
							<SelectTrigger id="editLang">
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
						<Label htmlFor="editExpected">예상 verdict</Label>
						<Select
							value={expectedVerdict}
							onValueChange={(v) => setExpectedVerdict(v as WorkshopExpectedVerdict)}
							disabled={pending}
						>
							<SelectTrigger id="editExpected">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EXPECTED_VERDICTS.map((v) => (
									<SelectItem key={v} value={v}>
										{expectedVerdictLabel(v)} ({v})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<div className="h-[50vh] border rounded overflow-hidden">
					{loadErr && (
						<div className="flex items-center justify-center h-full text-destructive text-sm">
							{loadErr}
						</div>
					)}
					{source === null && !loadErr && (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							<Loader2 className="h-4 w-4 animate-spin mr-2" />
							불러오는 중...
						</div>
					)}
					{source !== null && (
						<Editor
							height="100%"
							value={source}
							onChange={(v) => setSource(v ?? "")}
							language={monacoLang(language)}
							theme="vs-dark"
							options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
						/>
					)}
				</div>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
						취소
					</Button>
					<Button type="button" onClick={onSubmit} disabled={pending || source === null}>
						{pending ? "저장 중..." : "저장"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteSolutionDialog({
	problemId,
	row,
	onClose,
}: {
	problemId: number;
	row: Row;
	onClose: () => void;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	function onConfirm() {
		startTransition(async () => {
			try {
				await deleteWorkshopSolution(problemId, row.id);
				toast.success("삭제되었습니다");
				onClose();
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
			}
		});
	}
	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>솔루션 삭제</DialogTitle>
					<DialogDescription>
						{row.name}을(를) 삭제합니다.{" "}
						{row.isMain && "메인 솔루션이 없어지면 정답 재생성이 불가능해집니다."}
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
