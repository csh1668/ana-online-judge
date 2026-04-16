"use client";

import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteWorkshopValidator,
	resetWorkshopValidatorToPreset,
	saveWorkshopValidatorSource,
	startWorkshopFullValidation,
} from "@/actions/workshop/validator";
import { Button } from "@/components/ui/button";
import type { WorkshopValidatorPreset } from "@/lib/workshop/bundled";
import {
	type LanguageOption,
	type PresetOption,
	SingleSourceEditor,
} from "../_components/single-source-editor";
import { monacoLangFor } from "../_components/source-input";

type TestcaseRow = {
	id: number;
	index: number;
	validationStatus: "pending" | "valid" | "invalid";
};

type JobStatus = {
	jobId: string;
	testcaseId: number;
	testcaseIndex: number;
	result?: { valid: boolean; message: string | null };
};

type Props = {
	problemId: number;
	initialLanguage: "cpp" | "python" | null;
	initialSource: string;
	hasValidator: boolean;
	testcases: TestcaseRow[];
	presets: PresetOption[];
};

const LANGUAGES: LanguageOption[] = [
	{ value: "cpp", label: "C++" },
	{ value: "python", label: "Python" },
];

export function ValidatorClient({
	problemId,
	initialLanguage,
	initialSource,
	hasValidator,
	testcases: initialTestcases,
	presets,
}: Props) {
	const [rows, setRows] = useState<TestcaseRow[]>(initialTestcases);
	const [jobs, setJobs] = useState<Map<string, JobStatus>>(() => new Map());
	const [pendingRun, startRun] = useTransition();

	useEffect(() => setRows(initialTestcases), [initialTestcases]);

	const runningJobs = [...jobs.values()].filter((j) => !j.result).length;

	function runAll() {
		startRun(async () => {
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
		return () => es.close();
	}, [problemId]);

	return (
		<SingleSourceEditor
			initialLanguage={initialLanguage ?? "cpp"}
			initialSource={initialSource}
			hasPersisted={hasValidator}
			languages={LANGUAGES}
			presets={presets}
			acceptExts={[".cpp", ".cc", ".cxx", ".h", ".hpp", ".py"]}
			monacoLanguageFor={monacoLangFor}
			editorHeightClass="h-[55vh]"
			onSave={async ({ language, source }) => {
				await saveWorkshopValidatorSource(problemId, {
					language: language as "cpp" | "python",
					source,
				});
			}}
			onDelete={async () => {
				await deleteWorkshopValidator(problemId);
			}}
			onApplyPreset={async (id) => {
				const state = await resetWorkshopValidatorToPreset(
					problemId,
					id as WorkshopValidatorPreset
				);
				return { language: state.language, source: state.source };
			}}
		>
			<div>
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-sm font-medium">테스트케이스 검증 상태</h2>
					<div className="flex items-center gap-2">
						{runningJobs > 0 && (
							<span className="text-xs text-muted-foreground">
								실행 중 {runningJobs} / 총 {jobs.size}
							</span>
						)}
						<Button
							size="sm"
							onClick={runAll}
							disabled={!hasValidator || pendingRun || rows.length === 0}
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
		</SingleSourceEditor>
	);
}

function StatusIcon({ status }: { status: TestcaseRow["validationStatus"] }) {
	if (status === "valid") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
	if (status === "invalid") return <XCircle className="h-4 w-4 text-destructive" />;
	return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />;
}
