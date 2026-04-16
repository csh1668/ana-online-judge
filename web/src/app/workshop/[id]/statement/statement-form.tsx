"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadWorkshopProblemImage } from "@/actions/workshop/images";
import { updateWorkshopStatement } from "@/actions/workshop/statement";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
	problemId: number;
	initialTitle: string;
	initialDescription: string;
};

export function StatementForm({ problemId, initialTitle, initialDescription }: Props) {
	const [title, setTitle] = useState(initialTitle);
	const [description, setDescription] = useState(initialDescription);
	const [savedTitle, setSavedTitle] = useState(initialTitle);
	const [savedDescription, setSavedDescription] = useState(initialDescription);
	const [pending, startTransition] = useTransition();

	const dirty = title !== savedTitle || description !== savedDescription;

	const imageUploadHandler = useCallback(
		(formData: FormData) => uploadWorkshopProblemImage(problemId, formData),
		[problemId]
	);

	function onSave() {
		startTransition(async () => {
			try {
				await updateWorkshopStatement(problemId, { title, description });
				setSavedTitle(title);
				setSavedDescription(description);
				toast.success("지문이 저장되었습니다");
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
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
