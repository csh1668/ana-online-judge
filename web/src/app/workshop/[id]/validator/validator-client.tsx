"use client";

import Editor from "@monaco-editor/react";
import { CheckCircle2, Loader2, Play, Save, Trash2, Upload, XCircle } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteWorkshopValidator,
	saveWorkshopValidatorSource,
	startWorkshopFullValidation,
} from "@/actions/workshop/validator";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type TestcaseRow = {
	id: number;
	index: number;
	validationStatus: "pending" | "valid" | "invalid";
};

type Props = {
	problemId: number;
	initialLanguage: "cpp" | "python" | null;
	initialSource: string;
	hasValidator: boolean;
	testcases: TestcaseRow[];
};

type JobStatus = {
	jobId: string;
	testcaseId: number;
	testcaseIndex: number;
	result?: { valid: boolean; message: string | null };
};

export function ValidatorClient({
	problemId,
	initialLanguage,
	initialSource,
	hasValidator,
	testcases: initialTestcases,
}: Props) {
	const [language, setLanguage] = useState<"cpp" | "python">(initialLanguage ?? "cpp");
	const [source, setSource] = useState<string>(initialSource);
	const [savedSource, setSavedSource] = useState<string>(initialSource);
	const [present, setPresent] = useState<boolean>(hasValidator);
	const [pendingSave, startSaveTransition] = useTransition();
	const [pendingDelete, startDeleteTransition] = useTransition();
	const [pendingRun, startRunTransition] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [rows, setRows] = useState<TestcaseRow[]>(initialTestcases);
	const [jobs, setJobs] = useState<Map<string, JobStatus>>(() => new Map());
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => setRows(initialTestcases), [initialTestcases]);

	const dirty = source !== savedSource;
	const runningJobs = [...jobs.values()].filter((j) => !j.result).length;

	function onSave() {
		if (!source.trim()) {
			toast.error("밸리데이터 소스가 비어 있습니다");
			return;
		}
		startSaveTransition(async () => {
			try {
				await saveWorkshopValidatorSource(problemId, { language, source });
				setSavedSource(source);
				setPresent(true);
				toast.success("밸리데이터가 저장되었습니다");
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
			}
		});
	}

	function onDelete() {
		startDeleteTransition(async () => {
			try {
				await deleteWorkshopValidator(problemId);
				setSource("");
				setSavedSource("");
				setPresent(false);
				setDeleteOpen(false);
				toast.success("밸리데이터를 삭제했습니다");
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
			}
		});
	}

	function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0];
		if (!f) return;
		if (f.size > 1024 * 1024) {
			toast.error("최대 1MB까지 업로드 가능합니다");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			setSource(typeof reader.result === "string" ? reader.result : "");
		};
		reader.onerror = () => toast.error("파일을 읽지 못했습니다");
		reader.readAsText(f);
		if (fileRef.current) fileRef.current.value = "";
	}

	function onRunAll() {
		startRunTransition(async () => {
			try {
				const { jobs: queued } = await startWorkshopFullValidation(problemId);
				const next = new Map<string, JobStatus>();
				for (const q of queued) {
					next.set(q.jobId, {
						jobId: q.jobId,
						testcaseId: q.testcaseId,
						testcaseIndex: q.testcaseIndex,
					});
				}
				setJobs(next);
				// Reset visual status for all rows we just enqueued.
				setRows((prev) =>
					prev.map((r) =>
						queued.some((q) => q.testcaseId === r.id)
							? { ...r, validationStatus: "pending" as const }
							: r
					)
				);
				toast.info(`${queued.length}개 테스트에 대해 검증을 시작했습니다`);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "전체 검증을 시작하지 못했습니다");
			}
		});
	}

	// SSE: apply per-testcase results as they stream in.
	useEffect(() => {
		const es = new EventSource(`/api/workshop/${problemId}/validate/stream`);
		es.addEventListener("result", (e) => {
			try {
				const data = JSON.parse((e as MessageEvent).data) as {
					jobId: string;
					testcaseId: number;
					valid: boolean;
					message: string | null;
				};
				setJobs((prev) => {
					const next = new Map(prev);
					const existing = next.get(data.jobId);
					if (existing) {
						next.set(data.jobId, {
							...existing,
							result: { valid: data.valid, message: data.message },
						});
					}
					return next;
				});
				setRows((prev) =>
					prev.map((r) =>
						r.id === data.testcaseId
							? { ...r, validationStatus: data.valid ? "valid" : "invalid" }
							: r
					)
				);
			} catch (err) {
				console.error("[validator-client] SSE parse error:", err);
			}
		});
		es.onerror = () => {
			// Let the browser auto-reconnect; nothing to do here.
		};
		return () => es.close();
	}, [problemId]);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end gap-4">
				<div className="min-w-[140px]">
					<Label className="text-xs">언어</Label>
					<Select
						value={language}
						onValueChange={(v) => setLanguage(v as "cpp" | "python")}
						disabled={pendingSave || pendingRun}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="cpp">C++</SelectItem>
							<SelectItem value="python">Python</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div>
					<input
						ref={fileRef}
						type="file"
						accept=".cpp,.cc,.cxx,.h,.hpp,.py"
						onChange={onFilePicked}
						className="hidden"
					/>
					<Button variant="outline" onClick={() => fileRef.current?.click()} disabled={pendingSave}>
						<Upload className="h-4 w-4 mr-1" />
						파일에서 불러오기
					</Button>
				</div>
				<div className="ml-auto flex gap-2">
					{present && (
						<Button
							variant="outline"
							onClick={() => setDeleteOpen(true)}
							disabled={pendingDelete || pendingSave || pendingRun}
						>
							<Trash2 className="h-4 w-4 mr-1 text-destructive" />
							삭제
						</Button>
					)}
					<Button variant="outline" onClick={onSave} disabled={!dirty || pendingSave || pendingRun}>
						{pendingSave ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								저장 중...
							</>
						) : (
							<>
								<Save className="h-4 w-4 mr-1" />
								저장
							</>
						)}
					</Button>
					<Button
						onClick={onRunAll}
						disabled={!present || dirty || pendingRun || rows.length === 0}
						title={
							!present
								? "저장된 밸리데이터가 없습니다"
								: dirty
									? "변경사항을 먼저 저장해주세요"
									: rows.length === 0
										? "검증할 테스트케이스가 없습니다"
										: ""
						}
					>
						{pendingRun ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								시작 중...
							</>
						) : (
							<>
								<Play className="h-4 w-4 mr-1" />
								전체 검증
							</>
						)}
					</Button>
				</div>
			</div>

			<div className="h-[55vh] border rounded overflow-hidden">
				<Editor
					height="100%"
					value={source}
					language={language === "cpp" ? "cpp" : "python"}
					theme="vs-dark"
					onChange={(v) => setSource(v ?? "")}
					options={{
						minimap: { enabled: false },
						wordWrap: "on",
						fontSize: 13,
						tabSize: 4,
					}}
				/>
			</div>

			<div>
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-sm font-medium">테스트케이스 검증 상태</h2>
					{runningJobs > 0 && (
						<span className="text-xs text-muted-foreground">
							실행 중 {runningJobs} / 총 {jobs.size}
						</span>
					)}
				</div>
				{rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">테스트케이스가 없습니다.</p>
				) : (
					<ul className="divide-y border rounded text-sm">
						{rows.map((r) => {
							const jobEntry = [...jobs.values()].find((j) => j.testcaseId === r.id);
							const message = jobEntry?.result?.message ?? null;
							return (
								<li key={r.id} className="flex items-center px-3 py-2 gap-3">
									<span className="font-mono text-xs w-10">#{r.index}</span>
									<StatusIcon status={r.validationStatus} />
									<span className="flex-1 min-w-0">
										{r.validationStatus === "valid" && <span className="text-green-600">유효</span>}
										{r.validationStatus === "invalid" && (
											<span className="text-destructive">무효{message ? ` — ${message}` : ""}</span>
										)}
										{r.validationStatus === "pending" && (
											<span className="text-muted-foreground">대기 중</span>
										)}
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			{deleteOpen && (
				<Dialog open onOpenChange={(v) => !v && setDeleteOpen(false)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>밸리데이터 삭제</DialogTitle>
							<DialogDescription>
								현재 밸리데이터를 삭제합니다. "전체 검증"은 밸리데이터를 다시 등록한 후에 실행할 수
								있습니다.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={pendingDelete}>
								취소
							</Button>
							<Button variant="destructive" onClick={onDelete} disabled={pendingDelete}>
								{pendingDelete ? "삭제 중..." : "삭제"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}

function StatusIcon({ status }: { status: TestcaseRow["validationStatus"] }) {
	if (status === "valid") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
	if (status === "invalid") return <XCircle className="h-4 w-4 text-destructive" />;
	return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />;
}
