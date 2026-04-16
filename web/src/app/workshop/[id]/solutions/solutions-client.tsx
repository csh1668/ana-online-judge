"use client";

import { Loader2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createWorkshopSolutionFromForm,
	deleteWorkshopSolution,
	readWorkshopSolutionSource,
	setWorkshopMainSolution,
	updateWorkshopSolutionFromForm,
} from "@/actions/workshop/solutions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
	type LanguageOption,
	type ManagerRow,
	MultiSourceManager,
} from "../_components/multi-source-manager";
import { monacoLangFor } from "../_components/source-input";

type Row = ManagerRow & {
	language: Language;
	expectedVerdict: WorkshopExpectedVerdict;
	isMain: boolean;
};

type Props = {
	problemId: number;
	initialSolutions: Row[];
	testcaseCount: number;
	missingOutputCount: number;
	hasMain: boolean;
};

const LANGUAGES: LanguageOption[] = [
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

export function SolutionsClient({
	problemId,
	initialSolutions,
	testcaseCount,
	missingOutputCount,
	hasMain,
}: Props) {
	const router = useRouter();
	const [rows, setRows] = useState<Row[]>(initialSolutions);
	useEffect(() => setRows(initialSolutions), [initialSolutions]);

	return (
		<div className="space-y-4">
			<div className="text-sm text-muted-foreground">
				총 <span className="font-semibold text-foreground">{rows.length}</span>개 · 메인 솔루션{" "}
				{hasMain ? (
					<span className="text-green-600 font-medium">있음</span>
				) : (
					<span className="text-destructive font-medium">없음</span>
				)}{" "}
				· 테스트 {testcaseCount}개 (정답 미생성 {missingOutputCount}개)
			</div>

			<MultiSourceManager<Row>
				kind="솔루션"
				rows={rows}
				languages={LANGUAGES}
				defaultLanguage="cpp"
				acceptExts={[".c", ".cpp", ".cc", ".cxx", ".py", ".java", ".rs", ".go", ".js"]}
				monacoLanguageFor={monacoLangFor}
				renderRowMeta={(r) => (
					<>
						{r.isMain && (
							<Badge variant="default" className="gap-1">
								<Star className="h-3 w-3" />
								메인
							</Badge>
						)}
						<Badge variant="secondary">{r.language}</Badge>
						<Badge variant="outline">{expectedVerdictLabel(r.expectedVerdict)}</Badge>
					</>
				)}
				renderRowActions={(r) =>
					r.isMain ? null : <SetMainButton problemId={problemId} solutionId={r.id} />
				}
				initialExtraFields={(row) => ({
					expectedVerdict: row?.expectedVerdict ?? "accepted",
					isMain: row?.isMain ? "true" : "false",
				})}
				renderExtraFields={(values, setValue, mode, disabled) => (
					<div className="grid grid-cols-2 gap-4">
						<div>
							<Label>예상 verdict</Label>
							<Select
								value={String(values.expectedVerdict ?? "accepted")}
								onValueChange={(v) => setValue("expectedVerdict", v)}
								disabled={disabled}
							>
								<SelectTrigger>
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
						{mode === "create" && (
							<div className="flex items-end gap-2">
								<Switch
									checked={values.isMain === "true"}
									onCheckedChange={(v) => setValue("isMain", v ? "true" : "false")}
									disabled={disabled}
								/>
								<Label>메인 솔루션 (정답 생성용)</Label>
							</div>
						)}
					</div>
				)}
				onCreate={async (payload) => {
					const fd = new FormData();
					fd.append("name", payload.name);
					fd.append("language", payload.language);
					fd.append("expectedVerdict", String(payload.extraFields.expectedVerdict ?? "accepted"));
					fd.append("isMain", String(payload.extraFields.isMain ?? "false"));
					if (payload.mode === "file" && payload.file) {
						fd.append("file", payload.file);
					} else {
						fd.append("source", payload.inlineSource);
					}
					await createWorkshopSolutionFromForm(problemId, fd);
					router.refresh();
				}}
				onReadSource={async (id) => {
					const { text, language } = await readWorkshopSolutionSource(problemId, id);
					return { text, language };
				}}
				onUpdate={async (payload) => {
					const fd = new FormData();
					fd.append("name", payload.name);
					fd.append("language", payload.language);
					fd.append("expectedVerdict", String(payload.extraFields.expectedVerdict ?? "accepted"));
					fd.append("source", payload.source);
					await updateWorkshopSolutionFromForm(problemId, payload.id, fd);
					router.refresh();
				}}
				onDelete={async (id) => {
					await deleteWorkshopSolution(problemId, id);
					router.refresh();
				}}
				deleteWarning={(row) =>
					row.isMain ? "메인 솔루션이 없어지면 정답 재생성이 불가능해집니다." : ""
				}
			/>
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
