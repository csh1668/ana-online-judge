"use client";

import { Editor } from "@monaco-editor/react";
import { Eye, FileArchive, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent } from "@/components/ui/card";
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
				<TestcasesGroupEditor
					key={initialTestcases.map((t) => t.id).join(",")}
					problemId={problemId}
					initialTestcases={initialTestcases}
					onPreview={openPreview}
					previewLoadingId={previewLoadingId}
					onEdit={setEditTarget}
					onDelete={setDeleteTarget}
				/>
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

type Entry = { type: "tc"; tc: Row } | { type: "divider"; id: string };

function buildInitialEntries(tcs: Row[]): Entry[] {
	const byGroup = new Map<number, Row[]>();
	for (const tc of tcs) {
		const g = tc.subtaskGroup ?? 0;
		if (!byGroup.has(g)) byGroup.set(g, []);
		byGroup.get(g)!.push(tc);
	}
	const sortedGroups = [...byGroup.keys()].sort((a, b) => a - b);
	const entries: Entry[] = [];
	sortedGroups.forEach((g, idx) => {
		if (idx > 0) entries.push({ type: "divider", id: `d-${g}` });
		for (const tc of byGroup.get(g)!) entries.push({ type: "tc", tc });
	});
	return entries;
}

function computeGroups(entries: Entry[]): Array<{ group: number; entries: Entry[] }> {
	const hasDivider = entries.some((e) => e.type === "divider");
	if (!hasDivider) {
		return [{ group: 0, entries: entries.filter((e) => e.type === "tc") }];
	}
	const groups: Array<{ group: number; entries: Entry[] }> = [];
	let current: Entry[] = [];
	let g = 1;
	const flush = () => {
		if (current.length > 0) {
			groups.push({ group: g, entries: current });
			g += 1;
			current = [];
		}
	};
	for (const e of entries) {
		if (e.type === "divider") {
			flush();
		} else {
			current.push(e);
		}
	}
	flush();
	return groups;
}

function TestcasesGroupEditor({
	problemId,
	initialTestcases,
	onPreview,
	previewLoadingId,
	onEdit,
	onDelete,
}: {
	problemId: number;
	initialTestcases: Row[];
	onPreview: (row: Row) => void;
	previewLoadingId: number | null;
	onEdit: (row: Row) => void;
	onDelete: (row: Row) => void;
}) {
	const router = useRouter();
	const [entries, setEntries] = useState<Entry[]>(() => buildInitialEntries(initialTestcases));
	const [scores, setScores] = useState<Record<number, number>>(() =>
		Object.fromEntries(initialTestcases.map((t) => [t.id, t.score ?? 0]))
	);
	const [pending, startTransition] = useTransition();

	const grouped = computeGroups(entries);
	const hasSubtasks = grouped.length > 1;

	function addDivider(afterIdx: number) {
		setEntries((prev) => {
			const next = [...prev];
			next.splice(afterIdx + 1, 0, { type: "divider", id: crypto.randomUUID() });
			return next;
		});
	}

	function removeDivider(atIdx: number) {
		setEntries((prev) => prev.filter((_, i) => i !== atIdx));
	}

	function save() {
		const updates: Array<{ id: number; subtaskGroup: number; score: number }> = [];
		for (const grp of grouped) {
			for (const e of grp.entries) {
				if (e.type !== "tc") continue;
				updates.push({
					id: e.tc.id,
					subtaskGroup: grp.group,
					score: scores[e.tc.id] ?? 0,
				});
			}
		}

		startTransition(async () => {
			try {
				for (const u of updates) {
					const original = initialTestcases.find((t) => t.id === u.id);
					if (!original) continue;
					const changed =
						(original.subtaskGroup ?? 0) !== u.subtaskGroup || (original.score ?? 0) !== u.score;
					if (!changed) continue;
					const fd = new FormData();
					fd.append("subtaskGroup", String(u.subtaskGroup));
					fd.append("score", String(u.score));
					await updateWorkshopTestcase(problemId, u.id, fd);
				}
				toast.success("저장되었습니다");
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
			}
		});
	}

	return (
		<Card>
			<CardContent className="space-y-3 p-4">
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						{hasSubtasks
							? `서브테스크 문제 — ${grouped.length}개 그룹`
							: "일반 문제 (구분선 추가 시 서브테스크 문제로 전환)"}
					</div>
					<Button onClick={save} disabled={pending} size="sm">
						{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						저장
					</Button>
				</div>
				{!hasSubtasks ? (
					<div className="text-xs text-muted-foreground">
						구분선을 추가하면 서브테스크 문제로 전환됩니다. 각 TC 행의 '구분선' 버튼을 눌러 그룹을
						나누세요.
					</div>
				) : (
					<div className="text-xs text-muted-foreground">
						구분선은 아래 목록의 휴지통 버튼으로 제거할 수 있습니다.
					</div>
				)}

				<div className="space-y-2">
					{grouped.map((grp) => (
						<div key={`group-${grp.group}`} className="rounded-md border">
							<div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm">
								<div className="flex items-center gap-2">
									<span className="font-medium">
										{hasSubtasks ? `Subtask ${grp.group}` : "테스트케이스"}
									</span>
									<Badge variant="outline">{grp.entries.length} TC</Badge>
									{hasSubtasks && (
										<Badge variant="secondary">
											Σ{" "}
											{grp.entries.reduce(
												(acc, e) => acc + (e.type === "tc" ? (scores[e.tc.id] ?? 0) : 0),
												0
											)}
											점
										</Badge>
									)}
								</div>
							</div>
							<div className="divide-y">
								{grp.entries.map((e) => {
									if (e.type !== "tc") return null;
									const flatIdx = entries.indexOf(e);
									const tc = e.tc;
									return (
										<div key={tc.id} className="flex items-center gap-3 px-3 py-2 text-sm">
											<span className="font-mono text-muted-foreground w-8">#{tc.index}</span>
											<Badge variant={tc.source === "manual" ? "secondary" : "outline"}>
												{tc.source}
											</Badge>
											{tc.hasOutput ? (
												<span className="text-xs text-muted-foreground">있음</span>
											) : (
												<span className="text-xs text-amber-600">없음</span>
											)}
											<Badge
												variant={
													tc.validationStatus === "valid"
														? "default"
														: tc.validationStatus === "invalid"
															? "destructive"
															: "secondary"
												}
											>
												{tc.validationStatus}
											</Badge>
											<div className="flex-1" />
											<label
												htmlFor={`tc-score-${tc.id}`}
												className="flex items-center gap-1 text-xs text-muted-foreground"
											>
												점수
												<Input
													id={`tc-score-${tc.id}`}
													type="number"
													min={0}
													value={scores[tc.id] ?? 0}
													onChange={(ev) =>
														setScores((prev) => ({
															...prev,
															[tc.id]: Number.parseInt(ev.target.value, 10) || 0,
														}))
													}
													className="w-20"
													disabled={!hasSubtasks}
												/>
											</label>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => onPreview(tc)}
												disabled={previewLoadingId === tc.id}
												title="미리보기"
											>
												{previewLoadingId === tc.id ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<Eye className="h-4 w-4" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => onEdit(tc)}
												disabled={tc.source !== "manual"}
												title={tc.source === "manual" ? "편집" : "수동 테스트만 편집 가능"}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => onDelete(tc)}
												disabled={tc.source !== "manual"}
												title={tc.source === "manual" ? "삭제" : "수동 테스트만 삭제 가능"}
											>
												<Trash2 className="h-4 w-4 text-destructive" />
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => addDivider(flatIdx)}
												title="이 테스트케이스 뒤에 구분선 추가"
											>
												<Plus className="h-3 w-3" /> 구분선
											</Button>
										</div>
									);
								})}
							</div>
						</div>
					))}
				</div>

				<div className="space-y-1">
					{entries.map((e, i) =>
						e.type === "divider" ? (
							<div
								key={e.id}
								className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1 text-xs"
							>
								<span className="flex-1">— 구분선 —</span>
								<Button variant="ghost" size="sm" onClick={() => removeDivider(i)}>
									<Trash2 className="h-3 w-3" />
								</Button>
							</div>
						) : null
					)}
				</div>
			</CardContent>
		</Card>
	);
}
