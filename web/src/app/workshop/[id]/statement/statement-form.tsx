"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadWorkshopProblemImage } from "@/actions/workshop/images";
import { updateWorkshopStatement } from "@/actions/workshop/statement";
import { MarkdownEditor } from "@/components/markdown-editor";
import { AddExampleDialog } from "@/components/problems/add-example-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_STATEMENT_CONTENT } from "@/lib/utils/default-statement";
import { DRAFT_VERSION_CONFLICT_MESSAGE } from "@/lib/workshop/draft-version";

type Props = {
	problemId: number;
	initialTitle: string;
	initialDescription: string;
	initialVersion: number;
};

export function StatementForm({
	problemId,
	initialTitle,
	initialDescription,
	initialVersion,
}: Props) {
	const [title, setTitle] = useState(initialTitle);
	const [description, setDescription] = useState(initialDescription || DEFAULT_STATEMENT_CONTENT);
	const [savedTitle, setSavedTitle] = useState(initialTitle);
	const [savedDescription, setSavedDescription] = useState(initialDescription);
	const [version, setVersion] = useState(initialVersion);
	const [pending, startTransition] = useTransition();
	const router = useRouter();

	// A conflict-recovery router.refresh() re-renders with a fresh
	// `initialVersion` but doesn't touch this state; re-sync so a retried
	// save targets the current version instead of re-conflicting forever.
	useEffect(() => {
		setVersion(initialVersion);
	}, [initialVersion]);

	const dirty = title !== savedTitle || description !== savedDescription;

	const imageUploadHandler = useCallback(
		(formData: FormData) => uploadWorkshopProblemImage(problemId, formData),
		[problemId]
	);

	function onSave() {
		startTransition(async () => {
			try {
				const updated = await updateWorkshopStatement(problemId, {
					title,
					description,
					expectedVersion: version,
				});
				setVersion(updated.version);
				setSavedTitle(title);
				setSavedDescription(description);
				toast.success("지문이 저장되었습니다");
			} catch (err) {
				const message = err instanceof Error ? err.message : "저장에 실패했습니다";
				if (message.includes(DRAFT_VERSION_CONFLICT_MESSAGE)) {
					toast.error(message, {
						action: { label: "새로고침", onClick: () => router.refresh() },
					});
				} else {
					toast.error(message);
				}
			}
		});
	}

	return (
		<div className="space-y-4">
			<div>
				<Label htmlFor="title">제목</Label>
				<Input
					id="title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					maxLength={200}
					disabled={pending}
				/>
			</div>
			<div>
				<Label>지문 (Markdown + KaTeX)</Label>
				<MarkdownEditor
					value={description}
					onChange={setDescription}
					minHeight="520px"
					disabled={pending}
					imageUploadHandler={imageUploadHandler}
					toolbarExtra={<AddExampleDialog currentContent={description} onAppend={setDescription} />}
				/>
			</div>
			<div className="flex items-center justify-end gap-2">
				<p className="text-xs text-muted-foreground mr-auto">
					{dirty ? "저장되지 않은 변경사항이 있습니다" : "변경사항 없음"}
				</p>
				<Button onClick={onSave} disabled={pending || !dirty || !title.trim()}>
					{pending ? "저장 중..." : "저장"}
				</Button>
			</div>
		</div>
	);
}
