"use client";

import Editor from "@monaco-editor/react";
import { Loader2, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
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

export type LanguageOption = {
	value: string;
	label: string;
	disabled?: boolean;
};

export type PresetOption = {
	id: string;
	label: string;
	description?: string;
};

type Props = {
	initialLanguage: string;
	initialSource: string;
	hasPersisted: boolean;
	languages: LanguageOption[];
	presets?: PresetOption[];
	acceptExts?: string[]; // extensions for "파일에서 불러오기"
	monacoLanguageFor: (lang: string) => string;
	editorHeightClass?: string; // default h-[60vh]

	onSave: (payload: { language: string; source: string }) => Promise<void>;
	onDelete?: () => Promise<void>;
	/**
	 * Apply a preset. Return the new language+source so the editor replaces
	 * its buffer in one shot.
	 */
	onApplyPreset?: (presetId: string) => Promise<{ language: string; source: string }>;

	children?: ReactNode; // optional footer content (e.g. testcase panel)
};

export function SingleSourceEditor({
	initialLanguage,
	initialSource,
	hasPersisted,
	languages,
	presets,
	acceptExts,
	monacoLanguageFor,
	editorHeightClass = "h-[60vh]",
	onSave,
	onDelete,
	onApplyPreset,
	children,
}: Props) {
	const [language, setLanguage] = useState(initialLanguage);
	const [savedLanguage, setSavedLanguage] = useState(initialLanguage);
	const [source, setSource] = useState(initialSource);
	const [savedSource, setSavedSource] = useState(initialSource);
	const [present, setPresent] = useState(hasPersisted);
	const [pendingSave, startSave] = useTransition();
	const [pendingDelete, startDelete] = useTransition();
	const [pendingPreset, startPreset] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [confirmPreset, setConfirmPreset] = useState<PresetOption | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const dirty = source !== savedSource || language !== savedLanguage;
	const busy = pendingSave || pendingDelete || pendingPreset;

	function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
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

	function handleSave() {
		if (!source.trim()) {
			toast.error("소스가 비어 있습니다");
			return;
		}
		startSave(async () => {
			try {
				await onSave({ language, source });
				setSavedSource(source);
				setSavedLanguage(language);
				setPresent(true);
				toast.success("저장되었습니다");
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
			}
		});
	}

	function handleDelete() {
		if (!onDelete) return;
		startDelete(async () => {
			try {
				await onDelete();
				setSource("");
				setSavedSource("");
				setPresent(false);
				setDeleteOpen(false);
				toast.success("삭제되었습니다");
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
			}
		});
	}

	function applyPresetConfirmed() {
		if (!confirmPreset || !onApplyPreset) return;
		const preset = confirmPreset;
		startPreset(async () => {
			try {
				const next = await onApplyPreset(preset.id);
				setLanguage(next.language);
				setSavedLanguage(next.language);
				setSource(next.source);
				setSavedSource(next.source);
				setPresent(true);
				toast.success(`${preset.label} 프리셋을 적용했습니다`);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "프리셋 적용에 실패했습니다");
			} finally {
				setConfirmPreset(null);
			}
		});
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end gap-4">
				<div className="min-w-[140px]">
					<Label className="text-xs">언어</Label>
					<Select
						value={language}
						onValueChange={setLanguage}
						disabled={busy || languages.every((l) => l.disabled)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{languages.map((l) => (
								<SelectItem key={l.value} value={l.value} disabled={l.disabled}>
									{l.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{presets && presets.length > 0 && onApplyPreset && (
					<div className="min-w-[220px]">
						<Label className="text-xs">프리셋</Label>
						<Select
							value=""
							onValueChange={(id) => {
								const p = presets.find((x) => x.id === id);
								if (p) setConfirmPreset(p);
							}}
							disabled={busy}
						>
							<SelectTrigger>
								<SelectValue placeholder="프리셋으로 리셋..." />
							</SelectTrigger>
							<SelectContent>
								{presets.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										<div className="flex flex-col">
											<span>{p.label}</span>
											{p.description && (
												<span className="text-xs text-muted-foreground">{p.description}</span>
											)}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				<div>
					<input
						ref={fileRef}
						type="file"
						accept={acceptExts?.join(",")}
						onChange={handleFilePick}
						className="hidden"
					/>
					<Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
						<Upload className="h-4 w-4 mr-1" />
						파일에서 불러오기
					</Button>
				</div>

				<div className="ml-auto flex gap-2">
					{onDelete && present && (
						<Button variant="outline" onClick={() => setDeleteOpen(true)} disabled={busy}>
							<Trash2 className="h-4 w-4 mr-1 text-destructive" />
							삭제
						</Button>
					)}
					<Button onClick={handleSave} disabled={!dirty || busy}>
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

			<div className={`${editorHeightClass} border rounded overflow-hidden`}>
				<Editor
					height="100%"
					value={source}
					onChange={(v) => setSource(v ?? "")}
					language={monacoLanguageFor(language)}
					theme="vs-dark"
					options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 13, tabSize: 4 }}
				/>
			</div>

			{children}

			{confirmPreset && (
				<Dialog open onOpenChange={(v) => !v && setConfirmPreset(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>프리셋으로 리셋</DialogTitle>
							<DialogDescription>
								현재 내용을 <strong>{confirmPreset.label}</strong>로 덮어씁니다. 저장되지 않은 수정
								사항은 사라집니다.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="ghost"
								onClick={() => setConfirmPreset(null)}
								disabled={pendingPreset}
							>
								<RotateCcw className="h-4 w-4 mr-1" />
								취소
							</Button>
							<Button onClick={applyPresetConfirmed} disabled={pendingPreset}>
								{pendingPreset ? "적용 중..." : "적용"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			{deleteOpen && (
				<Dialog open onOpenChange={(v) => !v && setDeleteOpen(false)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>삭제</DialogTitle>
							<DialogDescription>
								현재 소스를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={pendingDelete}>
								취소
							</Button>
							<Button variant="destructive" onClick={handleDelete} disabled={pendingDelete}>
								{pendingDelete ? "삭제 중..." : "삭제"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
