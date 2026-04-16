"use client";

import Editor from "@monaco-editor/react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { SourceInput, type SourceInputMode, type TemplateOption } from "./source-input";

export type ManagerRow = {
	id: number;
	name: string;
	updatedAt: string;
};

export type LanguageOption = { value: string; label: string };

export type CreatePayload = {
	name: string;
	language: string;
	mode: SourceInputMode;
	file: File | null;
	inlineSource: string;
	extraFields: Record<string, FormDataEntryValue>;
};

export type UpdatePayload = {
	id: number;
	name: string;
	language: string;
	source: string; // editor always returns text in edit mode
	extraFields: Record<string, FormDataEntryValue>;
};

type Props<Row extends ManagerRow> = {
	kind: string; // used in Dialog titles: "제너레이터", "리소스", "솔루션"
	rows: Row[];

	// Language selector config; pass empty array to hide the selector entirely
	// (resources don't have language metadata).
	languages: LanguageOption[];
	defaultLanguage?: string;

	// Optional starter templates shown in SourceInput (inline mode)
	templates?: TemplateOption[];
	onFetchTemplate?: (id: string) => Promise<{ language?: string; content: string }>;

	// File-picker extension filter (e.g. [".cpp", ".py"])
	acceptExts?: string[];

	// Optional row content slots
	renderRowMeta?: (row: Row) => ReactNode;
	renderRowActions?: (row: Row) => ReactNode;

	// Optional modal extra-fields slot. Provided state map is a controlled
	// Record<string, FormDataEntryValue>. Return React nodes that read/write
	// via the passed setter.
	renderExtraFields?: (
		values: Record<string, FormDataEntryValue>,
		setValue: (key: string, v: FormDataEntryValue) => void,
		mode: "create" | "edit",
		disabled: boolean
	) => ReactNode;
	initialExtraFields?: (row: Row | null) => Record<string, FormDataEntryValue>;

	// IO
	monacoLanguageFor: (lang: string) => string;
	onCreate: (payload: CreatePayload) => Promise<void>;
	onUpdate: (payload: UpdatePayload) => Promise<void>;
	onDelete: (id: number) => Promise<void>;
	onReadSource: (id: number) => Promise<{ text: string; language?: string; name?: string }>;

	// Used on rename warning text in delete dialog (optional)
	deleteWarning?: (row: Row) => string;
};

export function MultiSourceManager<Row extends ManagerRow>(props: Props<Row>) {
	const {
		kind,
		rows,
		languages,
		defaultLanguage,
		templates,
		onFetchTemplate,
		acceptExts,
		renderRowMeta,
		renderRowActions,
		renderExtraFields,
		initialExtraFields,
		monacoLanguageFor,
		onCreate,
		onUpdate,
		onDelete,
		onReadSource,
		deleteWarning,
	} = props;

	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Row | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="h-4 w-4 mr-1" />
					{kind} 추가
				</Button>
			</div>

			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{kind}이(가) 없습니다. 위 버튼으로 추가하세요.
				</p>
			) : (
				<ul className="divide-y border rounded">
					{rows.map((r) => (
						<li key={r.id} className="flex items-center justify-between px-4 py-3 gap-2">
							<div className="flex-1 min-w-0">
								<div className="font-mono text-sm flex items-center gap-2 flex-wrap">
									<span className="truncate">{r.name}</span>
									{renderRowMeta?.(r)}
								</div>
								<div className="text-xs text-muted-foreground mt-1">
									업데이트: {new Date(r.updatedAt).toLocaleString("ko-KR")}
								</div>
							</div>
							<div className="flex items-center gap-1">
								{renderRowActions?.(r)}
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

			{createOpen && (
				<CreateDialog
					kind={kind}
					languages={languages}
					defaultLanguage={defaultLanguage}
					templates={templates}
					onFetchTemplate={onFetchTemplate}
					acceptExts={acceptExts}
					renderExtraFields={renderExtraFields}
					initialExtraFields={initialExtraFields ? () => initialExtraFields(null) : undefined}
					monacoLanguageFor={monacoLanguageFor}
					onCreate={onCreate}
					onClose={() => setCreateOpen(false)}
				/>
			)}

			{editTarget && (
				<EditDialog
					kind={kind}
					row={editTarget}
					languages={languages}
					renderExtraFields={renderExtraFields}
					initialExtraFields={initialExtraFields ? () => initialExtraFields(editTarget) : undefined}
					monacoLanguageFor={monacoLanguageFor}
					onReadSource={onReadSource}
					onUpdate={onUpdate}
					onClose={() => setEditTarget(null)}
				/>
			)}

			{deleteTarget && (
				<DeleteDialog
					kind={kind}
					row={deleteTarget}
					warning={deleteWarning?.(deleteTarget)}
					onDelete={onDelete}
					onClose={() => setDeleteTarget(null)}
				/>
			)}
		</div>
	);
}

function CreateDialog<Row extends ManagerRow>(props: {
	kind: string;
	languages: LanguageOption[];
	defaultLanguage?: string;
	templates?: TemplateOption[];
	onFetchTemplate?: (id: string) => Promise<{ language?: string; content: string }>;
	acceptExts?: string[];
	renderExtraFields?: Props<Row>["renderExtraFields"];
	initialExtraFields?: () => Record<string, FormDataEntryValue>;
	monacoLanguageFor: (lang: string) => string;
	onCreate: (payload: CreatePayload) => Promise<void>;
	onClose: () => void;
}) {
	const {
		kind,
		languages,
		defaultLanguage,
		templates,
		onFetchTemplate,
		acceptExts,
		renderExtraFields,
		initialExtraFields,
		monacoLanguageFor,
		onCreate,
		onClose,
	} = props;

	const [name, setName] = useState("");
	const [language, setLanguage] = useState(defaultLanguage ?? languages[0]?.value ?? "");
	const [mode, setMode] = useState<SourceInputMode>("file");
	const [file, setFile] = useState<File | null>(null);
	const [inlineSource, setInlineSource] = useState("");
	const [extra, setExtra] = useState<Record<string, FormDataEntryValue>>(
		() => initialExtraFields?.() ?? {}
	);
	const [pending, startTransition] = useTransition();
	const [templatePending, setTemplatePending] = useState(false);

	async function pickTemplate(id: string) {
		if (!onFetchTemplate) return;
		if (inlineSource.trim().length > 0) {
			const ok = window.confirm("현재 입력된 소스를 템플릿으로 덮어쓸까요?");
			if (!ok) return;
		}
		setTemplatePending(true);
		try {
			const { content, language: tplLang } = await onFetchTemplate(id);
			setInlineSource(content);
			if (tplLang) setLanguage(tplLang);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "템플릿을 불러오지 못했습니다");
		} finally {
			setTemplatePending(false);
		}
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			toast.error("이름을 입력해주세요");
			return;
		}
		if (mode === "file" && !file) {
			toast.error("파일을 선택해주세요");
			return;
		}
		if (mode === "inline" && !inlineSource.trim()) {
			toast.error("소스 코드를 입력해주세요");
			return;
		}
		startTransition(async () => {
			try {
				await onCreate({
					name: name.trim(),
					language,
					mode,
					file,
					inlineSource,
					extraFields: extra,
				});
				toast.success("추가되었습니다");
				onClose();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "추가에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>{kind} 추가</DialogTitle>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<Label htmlFor="msm-name">이름</Label>
							<Input
								id="msm-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								disabled={pending}
							/>
						</div>
						{languages.length > 0 && (
							<div>
								<Label>언어</Label>
								<Select value={language} onValueChange={setLanguage} disabled={pending}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{languages.map((l) => (
											<SelectItem key={l.value} value={l.value}>
												{l.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>

					{renderExtraFields?.(
						extra,
						(k, v) => setExtra((prev) => ({ ...prev, [k]: v })),
						"create",
						pending
					)}

					<SourceInput
						mode={mode}
						onModeChange={setMode}
						file={file}
						onFileChange={setFile}
						acceptExts={acceptExts}
						inlineSource={inlineSource}
						onInlineSourceChange={setInlineSource}
						monacoLanguage={monacoLanguageFor(language)}
						templates={templates}
						onTemplatePick={onFetchTemplate ? pickTemplate : undefined}
						templatePending={templatePending}
						disabled={pending}
					/>

					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
							취소
						</Button>
						<Button type="submit" disabled={pending}>
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

function EditDialog<Row extends ManagerRow>(props: {
	kind: string;
	row: Row;
	languages: LanguageOption[];
	renderExtraFields?: Props<Row>["renderExtraFields"];
	initialExtraFields?: () => Record<string, FormDataEntryValue>;
	monacoLanguageFor: (lang: string) => string;
	onReadSource: Props<Row>["onReadSource"];
	onUpdate: Props<Row>["onUpdate"];
	onClose: () => void;
}) {
	const {
		kind,
		row,
		languages,
		renderExtraFields,
		initialExtraFields,
		monacoLanguageFor,
		onReadSource,
		onUpdate,
		onClose,
	} = props;

	const [name, setName] = useState(row.name);
	const [language, setLanguage] = useState(languages[0]?.value ?? "");
	const [source, setSource] = useState<string | null>(null);
	const [loadErr, setLoadErr] = useState<string | null>(null);
	const [extra, setExtra] = useState<Record<string, FormDataEntryValue>>(
		() => initialExtraFields?.() ?? {}
	);
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const result = await onReadSource(row.id);
				if (cancelled) return;
				setSource(result.text);
				if (result.language) setLanguage(result.language);
			} catch (err) {
				if (!cancelled) setLoadErr(err instanceof Error ? err.message : "불러오지 못했습니다");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [onReadSource, row.id]);

	function submit() {
		if (!name.trim()) {
			toast.error("이름을 입력해주세요");
			return;
		}
		if (source === null) return;
		startTransition(async () => {
			try {
				await onUpdate({
					id: row.id,
					name: name.trim(),
					language,
					source,
					extraFields: extra,
				});
				toast.success("저장되었습니다");
				onClose();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>{kind} 편집</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<Label htmlFor="msm-edit-name">이름</Label>
							<Input
								id="msm-edit-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								disabled={pending}
							/>
						</div>
						{languages.length > 0 && (
							<div>
								<Label>언어</Label>
								<Select value={language} onValueChange={setLanguage} disabled={pending}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{languages.map((l) => (
											<SelectItem key={l.value} value={l.value}>
												{l.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>

					{renderExtraFields?.(
						extra,
						(k, v) => setExtra((prev) => ({ ...prev, [k]: v })),
						"edit",
						pending
					)}

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
								language={monacoLanguageFor(language)}
								theme="vs-dark"
								options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
							/>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={pending}>
						취소
					</Button>
					<Button onClick={submit} disabled={pending || source === null}>
						{pending ? "저장 중..." : "저장"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteDialog<Row extends ManagerRow>({
	kind,
	row,
	warning,
	onDelete,
	onClose,
}: {
	kind: string;
	row: Row;
	warning?: string;
	onDelete: (id: number) => Promise<void>;
	onClose: () => void;
}) {
	const [pending, startTransition] = useTransition();
	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{kind} 삭제</DialogTitle>
					<DialogDescription>
						{row.name}을(를) 삭제합니다.{warning ? ` ${warning}` : ""}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={pending}>
						취소
					</Button>
					<Button
						variant="destructive"
						disabled={pending}
						onClick={() =>
							startTransition(async () => {
								try {
									await onDelete(row.id);
									toast.success("삭제되었습니다");
									onClose();
								} catch (err) {
									toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
								}
							})
						}
					>
						{pending ? "삭제 중..." : "삭제"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { Badge };
