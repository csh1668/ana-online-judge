"use client";

import { Editor } from "@monaco-editor/react";
import { Eye, FileArchive, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	bulkUploadWorkshopTestcases,
	createWorkshopManualTestcase,
	deleteWorkshopTestcase,
	readWorkshopTestcaseContent,
	updateWorkshopTestcase,
} from "@/actions/workshop/testcases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

type PreviewState = {
	index: number;
	input: { text: string; size: number; truncated: boolean };
	output: { text: string; size: number; truncated: boolean } | null;
};

type Row = {
	id: number;
	index: number;
	source: "manual" | "generated";
	subtaskGroup: number;
	score: number;
	validationStatus: "pending" | "valid" | "invalid";
	hasOutput: boolean;
};

type Props = {
	problemId: number;
	initialTestcases: Row[];
};

export function TestcasesClient({ problemId, initialTestcases }: Props) {
	const [addOpen, setAddOpen] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Row | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
	const [preview, setPreview] = useState<PreviewState | null>(null);
	const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);

	async function openPreview(row: Row) {
		setPreviewLoadingId(row.id);
		try {
			const data = await readWorkshopTestcaseContent({ problemId, testcaseId: row.id });
			setPreview(data);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "미리보기 실패");
		} finally {
			setPreviewLoadingId(null);
		}
	}

	return (
		<div className="space-y-4">
			<SubtaskSummary testcases={initialTestcases} />
			<div className="flex justify-end gap-2">
				<Button variant="outline" onClick={() => setBulkOpen(true)}>
					<FileArchive className="h-4 w-4 mr-1" />
					ZIP 일괄 업로드
				</Button>
				<Button onClick={() => setAddOpen(true)}>
					<Plus className="h-4 w-4 mr-1" />
					테스트케이스 추가
				</Button>
			</div>
			{initialTestcases.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					테스트케이스가 없습니다. 하나를 추가하거나 ZIP으로 일괄 업로드하세요.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-16">#</TableHead>
							<TableHead className="w-24">종류</TableHead>
							<TableHead className="w-24">서브태스크</TableHead>
							<TableHead className="w-20">점수</TableHead>
							<TableHead className="w-24">출력</TableHead>
							<TableHead className="w-28">검증</TableHead>
							<TableHead className="w-32">작업</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{initialTestcases.map((t) => (
							<TableRow key={t.id}>
								<TableCell className="font-mono">{t.index}</TableCell>
								<TableCell>
									<Badge variant={t.source === "manual" ? "secondary" : "outline"}>
										{t.source}
									</Badge>
								</TableCell>
								<TableCell>{t.subtaskGroup}</TableCell>
								<TableCell>{t.score}</TableCell>
								<TableCell>
									{t.hasOutput ? (
										<span className="text-xs text-muted-foreground">있음</span>
									) : (
										<span className="text-xs text-amber-600">없음</span>
									)}
								</TableCell>
								<TableCell>
									<Badge
										variant={
											t.validationStatus === "valid"
												? "default"
												: t.validationStatus === "invalid"
													? "destructive"
													: "secondary"
										}
									>
										{t.validationStatus}
									</Badge>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => openPreview(t)}
											disabled={previewLoadingId === t.id}
											title="미리보기"
										>
											{previewLoadingId === t.id ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<Eye className="h-4 w-4" />
											)}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setEditTarget(t)}
											disabled={t.source !== "manual"}
											title={t.source === "manual" ? "편집" : "수동 테스트만 편집 가능"}
										>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setDeleteTarget(t)}
											disabled={t.source !== "manual"}
											title={t.source === "manual" ? "삭제" : "수동 테스트만 삭제 가능"}
										>
											<Trash2 className="h-4 w-4 text-destructive" />
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<AddTestcaseDialog open={addOpen} onOpenChange={setAddOpen} problemId={problemId} />
			<BulkTestcaseDialog open={bulkOpen} onOpenChange={setBulkOpen} problemId={problemId} />
			<Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>테스트 #{preview?.index} 미리보기</DialogTitle>
					</DialogHeader>
					{preview && (
						<Tabs defaultValue="input">
							<TabsList>
								<TabsTrigger value="input">입력 ({formatBytes(preview.input.size)})</TabsTrigger>
								<TabsTrigger value="output" disabled={!preview.output}>
									출력{preview.output ? ` (${formatBytes(preview.output.size)})` : " (없음)"}
								</TabsTrigger>
							</TabsList>
							<TabsContent value="input">
								{preview.input.truncated && (
									<p className="text-xs text-muted-foreground mb-2">
										파일이 200KB를 초과하여 일부만 표시됩니다 (전체{" "}
										{formatBytes(preview.input.size)}).
									</p>
								)}
								<Editor
									height="60vh"
									value={preview.input.text}
									options={{
										readOnly: true,
										minimap: { enabled: false },
										wordWrap: "on",
										fontSize: 13,
									}}
								/>
							</TabsContent>
							<TabsContent value="output">
								{preview.output && (
									<>
										{preview.output.truncated && (
											<p className="text-xs text-muted-foreground mb-2">
												파일이 200KB를 초과하여 일부만 표시됩니다 (전체{" "}
												{formatBytes(preview.output.size)}).
											</p>
										)}
										<Editor
											height="60vh"
											value={preview.output.text}
											options={{
												readOnly: true,
												minimap: { enabled: false },
												wordWrap: "on",
												fontSize: 13,
											}}
										/>
									</>
								)}
							</TabsContent>
						</Tabs>
					)}
				</DialogContent>
			</Dialog>
			{editTarget && (
				<EditTestcaseDialog
					problemId={problemId}
					row={editTarget}
					onClose={() => setEditTarget(null)}
				/>
			)}
			{deleteTarget && (
				<DeleteTestcaseDialog
					problemId={problemId}
					row={deleteTarget}
					onClose={() => setDeleteTarget(null)}
				/>
			)}
		</div>
	);
}

function AddTestcaseDialog({
	open,
	onOpenChange,
	problemId,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
}) {
	const [pending, startTransition] = useTransition();
	const [inputFile, setInputFile] = useState<File | null>(null);
	const [outputFile, setOutputFile] = useState<File | null>(null);
	const [score, setScore] = useState("0");
	const [subtaskGroup, setSubtaskGroup] = useState("0");

	function reset() {
		setInputFile(null);
		setOutputFile(null);
		setScore("0");
		setSubtaskGroup("0");
	}

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!inputFile) {
			toast.error("입력 파일을 선택해주세요");
			return;
		}
		const fd = new FormData();
		fd.append("inputFile", inputFile);
		if (outputFile) fd.append("outputFile", outputFile);
		fd.append("score", score);
		fd.append("subtaskGroup", subtaskGroup);
		startTransition(async () => {
			try {
				await createWorkshopManualTestcase(problemId, fd);
				toast.success("테스트케이스가 추가되었습니다");
				reset();
				onOpenChange(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "추가에 실패했습니다");
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
			<DialogContent>
				<DialogHeader>
					<DialogTitle>테스트케이스 추가 (수동)</DialogTitle>
					<DialogDescription>
						입력 파일은 필수, 출력 파일은 선택사항입니다. 출력이 없으면 이후 메인 솔루션으로 정답을
						생성합니다.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<Label htmlFor="tcIn">입력 파일</Label>
						<Input
							id="tcIn"
							type="file"
							onChange={(e) => setInputFile(e.target.files?.[0] ?? null)}
							disabled={pending}
						/>
					</div>
					<div>
						<Label htmlFor="tcOut">출력 파일 (선택)</Label>
						<Input
							id="tcOut"
							type="file"
							onChange={(e) => setOutputFile(e.target.files?.[0] ?? null)}
							disabled={pending}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="tcGroup">서브태스크 그룹</Label>
							<Input
								id="tcGroup"
								type="number"
								min={0}
								value={subtaskGroup}
								onChange={(e) => setSubtaskGroup(e.target.value)}
								disabled={pending}
							/>
						</div>
						<div>
							<Label htmlFor="tcScore">점수</Label>
							<Input
								id="tcScore"
								type="number"
								min={0}
								value={score}
								onChange={(e) => setScore(e.target.value)}
								disabled={pending}
							/>
						</div>
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
						<Button type="submit" disabled={pending || !inputFile}>
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
				</form>
			</DialogContent>
		</Dialog>
	);
}

function EditTestcaseDialog({
	problemId,
	row,
	onClose,
}: {
	problemId: number;
	row: Row;
	onClose: () => void;
}) {
	const [pending, startTransition] = useTransition();
	const [inputFile, setInputFile] = useState<File | null>(null);
	const [outputFile, setOutputFile] = useState<File | null>(null);
	const [clearOutput, setClearOutput] = useState(false);
	const [score, setScore] = useState(String(row.score));
	const [subtaskGroup, setSubtaskGroup] = useState(String(row.subtaskGroup));

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		const fd = new FormData();
		if (inputFile) fd.append("inputFile", inputFile);
		if (outputFile && !clearOutput) fd.append("outputFile", outputFile);
		if (clearOutput) fd.append("clearOutput", "true");
		fd.append("score", score);
		fd.append("subtaskGroup", subtaskGroup);
		startTransition(async () => {
			try {
				await updateWorkshopTestcase(problemId, row.id, fd);
				toast.success("변경사항이 저장되었습니다");
				onClose();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>테스트케이스 #{row.index} 편집</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<Label htmlFor="tcInEdit">입력 파일 다시 업로드 (선택)</Label>
						<Input
							id="tcInEdit"
							type="file"
							onChange={(e) => setInputFile(e.target.files?.[0] ?? null)}
							disabled={pending}
						/>
					</div>
					<div>
						<Label htmlFor="tcOutEdit">출력 파일 다시 업로드 (선택)</Label>
						<Input
							id="tcOutEdit"
							type="file"
							onChange={(e) => setOutputFile(e.target.files?.[0] ?? null)}
							disabled={pending || clearOutput}
						/>
						<div className="flex items-center gap-2 mt-2">
							<Checkbox
								id="clearOut"
								checked={clearOutput}
								onCheckedChange={(v) => setClearOutput(Boolean(v))}
								disabled={pending || !row.hasOutput}
							/>
							<Label htmlFor="clearOut" className="text-sm">
								출력 제거 (정답 재생성 대기)
							</Label>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="tcGroupEdit">서브태스크 그룹</Label>
							<Input
								id="tcGroupEdit"
								type="number"
								min={0}
								value={subtaskGroup}
								onChange={(e) => setSubtaskGroup(e.target.value)}
								disabled={pending}
							/>
						</div>
						<div>
							<Label htmlFor="tcScoreEdit">점수</Label>
							<Input
								id="tcScoreEdit"
								type="number"
								min={0}
								value={score}
								onChange={(e) => setScore(e.target.value)}
								disabled={pending}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
							취소
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? "저장 중..." : "저장"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteTestcaseDialog({
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
				await deleteWorkshopTestcase(problemId, row.id);
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
					<DialogTitle>테스트케이스 #{row.index} 삭제</DialogTitle>
					<DialogDescription>
						이 테스트를 삭제하고 나머지 테스트의 번호를 1..N으로 재할당합니다. 입력/출력 파일도 새
						번호에 맞게 이름이 변경됩니다. 이전 인보케이션 결과는 번호가 달라질 수 있습니다.
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

function BulkTestcaseDialog({
	open,
	onOpenChange,
	problemId,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
}) {
	const [pending, startTransition] = useTransition();
	const [zipFile, setZipFile] = useState<File | null>(null);
	const [score, setScore] = useState("0");
	const [subtaskGroup, setSubtaskGroup] = useState("0");

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!zipFile) {
			toast.error("ZIP 파일을 선택해주세요");
			return;
		}
		const fd = new FormData();
		fd.append("zipFile", zipFile);
		fd.append("defaultScore", score);
		fd.append("defaultSubtaskGroup", subtaskGroup);
		startTransition(async () => {
			try {
				const result = await bulkUploadWorkshopTestcases(problemId, fd);
				toast.success(`${result.count}개의 테스트케이스가 추가되었습니다`);
				setZipFile(null);
				onOpenChange(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "업로드에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>ZIP 일괄 업로드</DialogTitle>
					<DialogDescription>
						파일명이 <code className="font-mono">1.in</code>,{" "}
						<code className="font-mono">1.out</code>, <code className="font-mono">2.in</code>, ...
						형식인 ZIP을 업로드하세요. 출력(.out)은 선택사항이며 누락된 인덱스는 정답 미생성 상태로
						추가됩니다.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<Label htmlFor="tcZip">ZIP 파일</Label>
						<Input
							id="tcZip"
							type="file"
							accept=".zip"
							onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
							disabled={pending}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="bulkGroup">기본 서브태스크 그룹</Label>
							<Input
								id="bulkGroup"
								type="number"
								min={0}
								value={subtaskGroup}
								onChange={(e) => setSubtaskGroup(e.target.value)}
								disabled={pending}
							/>
						</div>
						<div>
							<Label htmlFor="bulkScore">기본 점수</Label>
							<Input
								id="bulkScore"
								type="number"
								min={0}
								value={score}
								onChange={(e) => setScore(e.target.value)}
								disabled={pending}
							/>
						</div>
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
						<Button type="submit" disabled={pending || !zipFile}>
							{pending ? (
								<>
									<Loader2 className="h-4 w-4 mr-1 animate-spin" />
									처리 중...
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

function SubtaskSummary({ testcases }: { testcases: Row[] }) {
	if (testcases.length === 0) return null;

	const byGroup = new Map<number, Row[]>();
	for (const t of testcases) {
		const g = t.subtaskGroup ?? 0;
		if (!byGroup.has(g)) byGroup.set(g, []);
		byGroup.get(g)!.push(t);
	}
	const groups = [...byGroup.entries()].sort((a, b) => a[0] - b[0]);
	const isSubtaskProblem = groups.length > 1;

	if (!isSubtaskProblem) {
		return (
			<div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				일반 문제 — 모든 테스트케이스가 서브태스크 그룹 0에 속합니다. 서브태스크 문제로 발행하려면
				편집 다이얼로그에서 각 테스트케이스에 서로 다른 서브태스크 그룹(1, 2, …)을 지정하세요.
			</div>
		);
	}

	return (
		<div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
			<div className="flex items-center gap-2 mb-1.5">
				<Badge variant="outline">서브태스크 문제</Badge>
				<span className="text-muted-foreground">
					{groups.length}개 그룹 — 발행 시 최대 점수 Σ{" "}
					{testcases.reduce((acc, t) => acc + t.score, 0)}점
				</span>
			</div>
			<div className="flex flex-wrap gap-2">
				{groups.map(([g, items]) => {
					const sum = items.reduce((acc, t) => acc + t.score, 0);
					return (
						<span
							key={g}
							className="rounded-md border bg-background px-2 py-0.5 font-mono text-[11px]"
						>
							Subtask {g}: {items.length} TC / {sum}점
						</span>
					);
				})}
			</div>
		</div>
	);
}
