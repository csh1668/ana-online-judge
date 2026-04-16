"use client";

import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { AlertCircle, CheckCircle2, Clock, Loader2, Play, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	checkInvocationPreconditionAction,
	generateWorkshopAnswers,
	runWorkshopInvocation,
} from "@/actions/workshop/invocations";
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
import type { Verdict } from "@/db/schema";
import { verdictShortLabel, type WorkshopExpectedVerdict } from "@/lib/workshop/expected-verdict";
import { InvocationMatrix, type MatrixCell } from "./matrix";

type Solution = {
	id: number;
	name: string;
	language: string;
	expectedVerdict: WorkshopExpectedVerdict;
	isMain: boolean;
};

type Testcase = {
	id: number;
	index: number;
	hasOutput: boolean;
};

type InvocationRow = {
	id: number;
	status: "running" | "completed" | "failed";
	selectedSolutionsJson: unknown;
	selectedTestcasesJson: unknown;
	resultsJson: unknown;
	createdAt: string;
	completedAt: string | null;
};

type Props = {
	problemId: number;
	solutions: Solution[];
	testcases: Testcase[];
	invocations: InvocationRow[];
	hasMain: boolean;
	missingOutputCount: number;
};

type StoredSolution = {
	id: number;
	name: string;
	language: string;
	expectedVerdict: WorkshopExpectedVerdict;
};
type StoredTestcase = { id: number; index: number };
type StoredCell = {
	solutionId: number;
	testcaseId: number;
	verdict: string;
	timeMs: number | null;
	memoryKb: number | null;
	stderr: string | null;
	checkerMessage: string | null;
	compileMessage: string | null;
	outputRef: string | null;
};

function parseInvocation(row: InvocationRow): {
	solutions: StoredSolution[];
	testcases: StoredTestcase[];
	cells: StoredCell[];
} {
	return {
		solutions: (row.selectedSolutionsJson as StoredSolution[]) ?? [],
		testcases: (row.selectedTestcasesJson as StoredTestcase[]) ?? [],
		cells: (row.resultsJson as StoredCell[]) ?? [],
	};
}

export function InvocationsClient(props: Props) {
	const { problemId, solutions, testcases, invocations, hasMain, missingOutputCount } = props;
	const router = useRouter();
	const [runDialogOpen, setRunDialogOpen] = useState(false);
	const [genOpen, setGenOpen] = useState(false);
	const [selectedInvocationId, setSelectedInvocationId] = useState<number | null>(
		invocations[0]?.id ?? null
	);
	const [detailCell, setDetailCell] = useState<{
		invocationId: number;
		solutionId: number;
		testcaseId: number;
	} | null>(null);

	// Local shadow of the selected invocation -- updated via SSE when running.
	const [liveCells, setLiveCells] = useState<StoredCell[]>([]);
	const [liveStatus, setLiveStatus] = useState<"running" | "completed" | "failed" | null>(null);

	const selectedInvocation = invocations.find((i) => i.id === selectedInvocationId) ?? null;

	useEffect(() => {
		setLiveCells(selectedInvocation ? parseInvocation(selectedInvocation).cells : []);
		setLiveStatus(selectedInvocation?.status ?? null);
	}, [selectedInvocation]);

	useEffect(() => {
		if (!selectedInvocation) return;
		if (selectedInvocation.status !== "running") return;
		const es = new EventSource(`/api/workshop/invocations/${selectedInvocation.id}/stream`);
		es.addEventListener("result", (ev) => {
			try {
				const cell = JSON.parse((ev as MessageEvent).data) as StoredCell;
				setLiveCells((prev) => {
					const exists = prev.find(
						(c) => c.solutionId === cell.solutionId && c.testcaseId === cell.testcaseId
					);
					if (exists) return prev;
					return [...prev, cell];
				});
			} catch (err) {
				console.error("Bad result event:", err);
			}
		});
		es.addEventListener("done", (ev) => {
			try {
				const payload = JSON.parse((ev as MessageEvent).data) as {
					status: "completed" | "failed";
				};
				setLiveStatus(payload.status);
				router.refresh();
			} catch (err) {
				console.error("Bad done event:", err);
			}
			es.close();
		});
		es.onerror = (err) => {
			console.error("Invocation SSE error:", err);
			es.close();
		};
		return () => es.close();
	}, [selectedInvocation, router]);

	const matrixSolutions = useMemo(() => {
		if (!selectedInvocation) return [];
		const { solutions: s } = parseInvocation(selectedInvocation);
		return s.map((sol) => ({
			id: sol.id,
			name: sol.name,
			language: sol.language,
			expectedVerdict: sol.expectedVerdict,
		}));
	}, [selectedInvocation]);

	const matrixTestcases = useMemo(() => {
		if (!selectedInvocation) return [];
		return parseInvocation(selectedInvocation).testcases;
	}, [selectedInvocation]);

	const matrixCells: MatrixCell[] = useMemo(
		() =>
			liveCells.map((c) => ({
				solutionId: c.solutionId,
				testcaseId: c.testcaseId,
				verdict: c.verdict as Verdict,
				timeMs: c.timeMs,
				memoryKb: c.memoryKb,
			})),
		[liveCells]
	);

	return (
		<div className="space-y-6">
			{/* Precondition summary + action bar */}
			<div className="flex flex-wrap items-center justify-between gap-2 border rounded p-3 bg-muted/20">
				<div className="text-sm">
					{hasMain ? (
						<span className="text-green-700">
							<CheckCircle2 className="inline h-4 w-4 mr-1" />
							메인 솔루션 있음
						</span>
					) : (
						<span className="text-destructive">
							<AlertCircle className="inline h-4 w-4 mr-1" />
							메인 솔루션 없음
						</span>
					)}
					<span className="mx-2">·</span>
					<span>
						테스트 {testcases.length}개 · 정답 미생성 {missingOutputCount}개
					</span>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						onClick={() => setGenOpen(true)}
						disabled={!hasMain || testcases.length === 0}
						title={
							!hasMain
								? "메인 솔루션이 필요합니다"
								: testcases.length === 0
									? "테스트케이스가 필요합니다"
									: "정답 생성"
						}
					>
						<Sparkles className="h-4 w-4 mr-1" />
						정답 생성
					</Button>
					<Button
						onClick={() => setRunDialogOpen(true)}
						disabled={!hasMain || missingOutputCount > 0 || solutions.length === 0}
						title={
							!hasMain
								? "메인 솔루션이 필요합니다"
								: missingOutputCount > 0
									? `정답이 없는 테스트가 ${missingOutputCount}개 있습니다`
									: solutions.length === 0
										? "솔루션을 먼저 등록하세요"
										: "인보케이션 실행"
						}
					>
						<Play className="h-4 w-4 mr-1" />
						인보케이션 실행
					</Button>
				</div>
			</div>

			{/* Current invocation matrix */}
			{selectedInvocation ? (
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm">
						<StatusBadge status={liveStatus ?? selectedInvocation.status} />
						<span className="text-muted-foreground">
							ID <code className="text-xs">#{selectedInvocation.id}</code>
						</span>
						<span className="text-muted-foreground">
							{formatDistanceToNow(new Date(selectedInvocation.createdAt), {
								addSuffix: true,
								locale: ko,
							})}
						</span>
					</div>
					<InvocationMatrix
						solutions={matrixSolutions}
						testcases={matrixTestcases}
						cells={matrixCells}
						onCellClick={(c) =>
							setDetailCell({
								invocationId: selectedInvocation.id,
								solutionId: c.solutionId,
								testcaseId: c.testcaseId,
							})
						}
					/>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">아직 인보케이션이 없습니다.</p>
			)}

			{/* Past invocations list */}
			{invocations.length > 1 && (
				<div className="space-y-2">
					<h2 className="text-sm font-medium text-muted-foreground">과거 인보케이션</h2>
					<ul className="divide-y border rounded">
						{invocations.map((inv) => {
							const isSelected = inv.id === selectedInvocationId;
							const parsed = parseInvocation(inv);
							const total = parsed.solutions.length * parsed.testcases.length;
							return (
								<li key={inv.id}>
									<button
										type="button"
										onClick={() => setSelectedInvocationId(inv.id)}
										className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-accent/40 ${
											isSelected ? "bg-accent/30" : ""
										}`}
									>
										<div className="flex items-center gap-2">
											<StatusBadge status={inv.status} />
											<code className="text-xs">#{inv.id}</code>
											<span className="text-xs text-muted-foreground">
												{parsed.solutions.length}x{parsed.testcases.length} ({parsed.cells.length}/
												{total})
											</span>
										</div>
										<span className="text-xs text-muted-foreground">
											{formatDistanceToNow(new Date(inv.createdAt), {
												addSuffix: true,
												locale: ko,
											})}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			<RunInvocationDialog
				open={runDialogOpen}
				onOpenChange={setRunDialogOpen}
				problemId={problemId}
				solutions={solutions}
				testcases={testcases}
				onLaunched={(newId) => {
					setRunDialogOpen(false);
					setSelectedInvocationId(newId);
					router.refresh();
				}}
			/>

			<GenerateAnswersDialog
				open={genOpen}
				onOpenChange={setGenOpen}
				problemId={problemId}
				testcaseCount={testcases.length}
				onLaunched={(newId) => {
					setGenOpen(false);
					setSelectedInvocationId(newId);
					router.refresh();
				}}
			/>

			{detailCell && (
				<CellDetailDialog {...detailCell} cells={liveCells} onClose={() => setDetailCell(null)} />
			)}
		</div>
	);
}

function StatusBadge({ status }: { status: "running" | "completed" | "failed" }) {
	if (status === "running") {
		return (
			<Badge variant="secondary" className="gap-1">
				<Loader2 className="h-3 w-3 animate-spin" />
				실행 중
			</Badge>
		);
	}
	if (status === "completed") {
		return (
			<Badge variant="default" className="gap-1 bg-green-600">
				<CheckCircle2 className="h-3 w-3" />
				완료
			</Badge>
		);
	}
	return (
		<Badge variant="destructive" className="gap-1">
			<AlertCircle className="h-3 w-3" />
			실패
		</Badge>
	);
}

function RunInvocationDialog({
	open,
	onOpenChange,
	problemId,
	solutions,
	testcases,
	onLaunched,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
	solutions: Solution[];
	testcases: Testcase[];
	onLaunched: (invocationId: number) => void;
}) {
	const [selSols, setSelSols] = useState<Set<number>>(new Set(solutions.map((s) => s.id)));
	const [rangeFrom, setRangeFrom] = useState<number>(1);
	const [rangeTo, setRangeTo] = useState<number>(
		testcases.length > 0 ? testcases[testcases.length - 1].index : 1
	);
	const [preconditionMsg, setPreconditionMsg] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setSelSols(new Set(solutions.map((s) => s.id)));
			setRangeFrom(1);
			setRangeTo(testcases.length > 0 ? testcases[testcases.length - 1].index : 1);
			setPreconditionMsg(null);
		}
	}, [open, solutions, testcases]);

	const selectedTestcases = useMemo(
		() => testcases.filter((t) => t.index >= rangeFrom && t.index <= rangeTo).map((t) => t.id),
		[testcases, rangeFrom, rangeTo]
	);

	const selectedSolutionsArr = useMemo(() => Array.from(selSols), [selSols]);

	// Live precondition probe when selections change
	const probe = useCallback(async () => {
		if (selectedSolutionsArr.length === 0 || selectedTestcases.length === 0) {
			setPreconditionMsg(null);
			return;
		}
		try {
			const failure = await checkInvocationPreconditionAction(
				problemId,
				selectedSolutionsArr,
				selectedTestcases
			);
			setPreconditionMsg(failure ? failure.message : null);
		} catch (err) {
			setPreconditionMsg(err instanceof Error ? err.message : "확인 실패");
		}
	}, [problemId, selectedSolutionsArr, selectedTestcases]);

	useEffect(() => {
		void probe();
	}, [probe]);

	function onSubmit() {
		if (preconditionMsg) {
			toast.error(preconditionMsg);
			return;
		}
		startTransition(async () => {
			try {
				const result = await runWorkshopInvocation(
					problemId,
					selectedSolutionsArr,
					selectedTestcases
				);
				toast.success("인보케이션이 시작되었습니다");
				onLaunched(result.invocationId);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "실행에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>인보케이션 실행</DialogTitle>
					<DialogDescription>
						선택한 솔루션과 테스트 조합으로 실행합니다. 과거 인보케이션은 보존됩니다.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<Label className="mb-2 block">솔루션</Label>
						<ul className="border rounded divide-y max-h-48 overflow-y-auto">
							{solutions.map((s) => (
								<li key={s.id} className="flex items-center gap-2 px-3 py-2">
									<Checkbox
										id={`sol-${s.id}`}
										checked={selSols.has(s.id)}
										onCheckedChange={(v) => {
											setSelSols((prev) => {
												const next = new Set(prev);
												if (v) next.add(s.id);
												else next.delete(s.id);
												return next;
											});
										}}
									/>
									<Label htmlFor={`sol-${s.id}`} className="flex-1 cursor-pointer">
										<span className="font-mono text-sm">{s.name}</span>
										{s.isMain && (
											<Badge variant="outline" className="ml-2 text-xs">
												메인
											</Badge>
										)}
										<span className="ml-2 text-xs text-muted-foreground">
											{s.language} · {s.expectedVerdict}
										</span>
									</Label>
								</li>
							))}
						</ul>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<Label htmlFor="rangeFrom">테스트 시작 번호</Label>
							<Input
								id="rangeFrom"
								type="number"
								min={1}
								value={rangeFrom}
								onChange={(e) => setRangeFrom(Number.parseInt(e.target.value, 10) || 1)}
								disabled={pending}
							/>
						</div>
						<div>
							<Label htmlFor="rangeTo">테스트 끝 번호</Label>
							<Input
								id="rangeTo"
								type="number"
								min={rangeFrom}
								value={rangeTo}
								onChange={(e) => setRangeTo(Number.parseInt(e.target.value, 10) || rangeFrom)}
								disabled={pending}
							/>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						선택된 테스트: {selectedTestcases.length}개 · 솔루션: {selSols.size}개 · 총{" "}
						{selectedTestcases.length * selSols.size}개 셀
					</p>

					{preconditionMsg && (
						<div className="flex items-start gap-2 p-3 border border-destructive/40 bg-destructive/10 rounded text-sm">
							<AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
							<div className="text-destructive">{preconditionMsg}</div>
						</div>
					)}
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
					<Button
						type="button"
						onClick={onSubmit}
						disabled={
							pending ||
							preconditionMsg !== null ||
							selSols.size === 0 ||
							selectedTestcases.length === 0
						}
					>
						{pending ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								시작 중...
							</>
						) : (
							"실행"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function GenerateAnswersDialog({
	open,
	onOpenChange,
	problemId,
	testcaseCount,
	onLaunched,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	problemId: number;
	testcaseCount: number;
	onLaunched: (invocationId: number) => void;
}) {
	const [pending, startTransition] = useTransition();
	function onConfirm() {
		startTransition(async () => {
			try {
				const result = await generateWorkshopAnswers(problemId);
				toast.success("정답 생성이 시작되었습니다");
				onLaunched(result.invocationId);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "실행에 실패했습니다");
			}
		});
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>정답 생성</DialogTitle>
					<DialogDescription>
						메인 솔루션(isMain=true)을 전체 {testcaseCount}개의 테스트에 대해 실행하여 각 테스트의
						output.txt를 생성합니다. 체커 없이 실행되며, 메인 솔루션이 AC를 받은 테스트만
						output.txt가 갱신됩니다.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={pending}
					>
						취소
					</Button>
					<Button type="button" onClick={onConfirm} disabled={pending}>
						{pending ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								시작 중...
							</>
						) : (
							"실행"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CellDetailDialog({
	invocationId,
	solutionId,
	testcaseId,
	cells,
	onClose,
}: {
	invocationId: number;
	solutionId: number;
	testcaseId: number;
	cells: StoredCell[];
	onClose: () => void;
}) {
	const cell = cells.find((c) => c.solutionId === solutionId && c.testcaseId === testcaseId);
	const [stdout, setStdout] = useState<{
		loading: boolean;
		text: string | null;
		error: string | null;
		truncated: boolean;
	}>({ loading: true, text: null, error: null, truncated: false });

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(
					`/api/workshop/invocations/${invocationId}/output/${solutionId}/${testcaseId}`
				);
				if (cancelled) return;
				if (!res.ok) {
					const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
					setStdout({
						loading: false,
						text: null,
						error: body.error ?? `HTTP ${res.status}`,
						truncated: false,
					});
					return;
				}
				const json = (await res.json()) as { text: string; truncated: boolean };
				setStdout({
					loading: false,
					text: json.text,
					error: null,
					truncated: json.truncated,
				});
			} catch (err) {
				if (cancelled) return;
				setStdout({
					loading: false,
					text: null,
					error: err instanceof Error ? err.message : "불러오지 못했습니다",
					truncated: false,
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [invocationId, solutionId, testcaseId]);

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						셀 상세 -- 솔루션 {solutionId} x 테스트 {testcaseId}
					</DialogTitle>
				</DialogHeader>
				{!cell ? (
					<div className="text-sm text-muted-foreground">
						<Clock className="inline h-4 w-4 mr-1" />
						아직 결과가 도착하지 않았습니다
					</div>
				) : (
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-sm">
							<Badge>{verdictShortLabel(cell.verdict as Verdict)}</Badge>
							<span>{cell.timeMs !== null ? `${cell.timeMs}ms` : "-"}</span>
							<span>{cell.memoryKb !== null ? `${Math.round(cell.memoryKb / 1024)}MB` : "-"}</span>
						</div>
						{cell.compileMessage && (
							<section>
								<h3 className="text-xs font-medium text-muted-foreground mb-1">Compile</h3>
								<pre className="text-xs bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
									{cell.compileMessage}
								</pre>
							</section>
						)}
						{cell.stderr && (
							<section>
								<h3 className="text-xs font-medium text-muted-foreground mb-1">Stderr</h3>
								<pre className="text-xs bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
									{cell.stderr}
								</pre>
							</section>
						)}
						{cell.checkerMessage && (
							<section>
								<h3 className="text-xs font-medium text-muted-foreground mb-1">Checker</h3>
								<pre className="text-xs bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
									{cell.checkerMessage}
								</pre>
							</section>
						)}
						<section>
							<h3 className="text-xs font-medium text-muted-foreground mb-1">
								Stdout
								{stdout.truncated && <span className="ml-2 text-destructive">(1MB 이후 잘림)</span>}
							</h3>
							{stdout.loading ? (
								<div className="text-xs text-muted-foreground">
									<Loader2 className="inline h-3 w-3 animate-spin mr-1" />
									불러오는 중...
								</div>
							) : stdout.error ? (
								<div className="text-xs text-destructive">{stdout.error}</div>
							) : (
								<pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-auto whitespace-pre-wrap">
									{stdout.text ?? ""}
								</pre>
							)}
						</section>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
