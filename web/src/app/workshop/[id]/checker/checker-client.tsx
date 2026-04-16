"use client";

import Editor from "@monaco-editor/react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	resetWorkshopCheckerToPreset,
	saveWorkshopCheckerSource,
} from "@/actions/workshop/checker";
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
import type { WorkshopCheckerPreset } from "@/lib/workshop/bundled";

type PresetRow = {
	id: WorkshopCheckerPreset;
	label: string;
	description: string;
};

type Props = {
	problemId: number;
	initialLanguage: "cpp" | "python";
	initialSource: string;
	presets: PresetRow[];
};

export function CheckerClient({ problemId, initialLanguage, initialSource, presets }: Props) {
	const [language, setLanguage] = useState<"cpp" | "python">(initialLanguage);
	const [source, setSource] = useState<string>(initialSource);
	const [savedSource, setSavedSource] = useState<string>(initialSource);
	const [pendingSave, startSaveTransition] = useTransition();
	const [pendingReset, startResetTransition] = useTransition();
	const [pendingPreset, setPendingPreset] = useState<PresetRow | null>(null);

	const dirty = source !== savedSource;

	function onSave() {
		startSaveTransition(async () => {
			try {
				await saveWorkshopCheckerSource(problemId, { language, source });
				setSavedSource(source);
				toast.success("체커가 저장되었습니다");
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
			}
		});
	}

	function onPresetSelected(id: string) {
		const preset = presets.find((p) => p.id === id);
		if (!preset) return;
		setPendingPreset(preset);
	}

	function confirmReset() {
		if (!pendingPreset) return;
		const preset = pendingPreset;
		startResetTransition(async () => {
			try {
				const state = await resetWorkshopCheckerToPreset(problemId, preset.id);
				setLanguage(state.language);
				setSource(state.source);
				setSavedSource(state.source);
				toast.success(`${preset.label} 프리셋을 적용했습니다`);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "프리셋 적용에 실패했습니다");
			} finally {
				setPendingPreset(null);
			}
		});
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end gap-4">
				<div className="min-w-[220px]">
					<Label className="text-xs">프리셋으로 리셋</Label>
					<Select value="" onValueChange={onPresetSelected} disabled={pendingReset || pendingSave}>
						<SelectTrigger>
							<SelectValue placeholder="프리셋 선택..." />
						</SelectTrigger>
						<SelectContent>
							{presets.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									<div className="flex flex-col">
										<span>{p.label}</span>
										<span className="text-xs text-muted-foreground">{p.description}</span>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="min-w-[140px]">
					<Label className="text-xs">언어</Label>
					<Select
						value={language}
						onValueChange={(v) => setLanguage(v as "cpp" | "python")}
						disabled
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="cpp">C++</SelectItem>
							<SelectItem value="python">Python (2차)</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-[10px] text-muted-foreground mt-1">
						MVP에서는 cpp 고정 (python 체커는 2차)
					</p>
				</div>
				<div className="ml-auto flex gap-2">
					<Button
						variant="outline"
						onClick={onSave}
						disabled={!dirty || pendingSave || pendingReset}
					>
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
				</div>
			</div>

			<div className="h-[65vh] border rounded overflow-hidden">
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

			{pendingPreset && (
				<Dialog open onOpenChange={(v) => !v && setPendingPreset(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>프리셋으로 리셋</DialogTitle>
							<DialogDescription>
								현재 체커를 <strong>{pendingPreset.label}</strong>로 덮어씁니다. 저장되지 않은 수정
								사항은 사라집니다.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="ghost"
								onClick={() => setPendingPreset(null)}
								disabled={pendingReset}
							>
								<RotateCcw className="h-4 w-4 mr-1" />
								취소
							</Button>
							<Button onClick={confirmReset} disabled={pendingReset}>
								{pendingReset ? "적용 중..." : "적용"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
