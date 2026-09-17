"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createUpdateNoteAction, updateUpdateNoteAction } from "@/actions/update-notes";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UpdateNote } from "@/db/schema";
import { publicEnv } from "@/lib/env/publicEnv";

/** Date → datetime-local 입력값("YYYY-MM-DDTHH:mm", 브라우저 로컬 타임존). */
function toDateTimeLocal(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
		date.getHours()
	)}:${pad(date.getMinutes())}`;
}

type Props = { mode: "create" } | { mode: "edit"; note: UpdateNote };

export function UpdateNoteForm(props: Props) {
	const note = props.mode === "edit" ? props.note : undefined;
	const router = useRouter();
	const [title, setTitle] = useState(note?.title ?? "");
	const [body, setBody] = useState(note?.body ?? "");
	const [publishedAt, setPublishedAt] = useState(
		toDateTimeLocal(note ? new Date(note.publishedAt) : new Date())
	);
	const [saving, setSaving] = useState(false);

	const applyBuildTime = () => {
		setPublishedAt(toDateTimeLocal(new Date(publicEnv.NEXT_PUBLIC_BUILD_TIME)));
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (body.trim().length === 0) {
			toast.error("본문을 입력하세요.");
			return;
		}
		setSaving(true);
		try {
			const input = { title, body, publishedAt: new Date(publishedAt) };
			if (props.mode === "edit") {
				await updateUpdateNoteAction(props.note.id, input);
				toast.success("업데이트 노트를 수정했습니다.");
			} else {
				await createUpdateNoteAction(input);
				toast.success("업데이트 노트를 추가했습니다.");
			}
			router.push("/admin/updates");
			router.refresh();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
			setSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div className="space-y-2">
				<Label htmlFor="update-note-title">제목 *</Label>
				<Input
					id="update-note-title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="예: 창작마당 격리 로직 개선"
					required
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="update-note-published-at">업데이트 시간 *</Label>
				<div className="flex gap-2">
					<Input
						id="update-note-published-at"
						type="datetime-local"
						value={publishedAt}
						onChange={(e) => setPublishedAt(e.target.value)}
						required
					/>
					<Button type="button" variant="outline" onClick={applyBuildTime}>
						마지막 업데이트 시각
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					작성 시각과 별개로 지정합니다. 이전 업데이트를 백필할 때는 그때의 시각을 넣으세요.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="update-note-body">본문 (마크다운) *</Label>
				<MarkdownEditor
					value={body}
					onChange={setBody}
					disabled={saving}
					minHeight="420px"
					className="w-full"
				/>
			</div>

			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>
					취소
				</Button>
				<Button type="submit" disabled={saving}>
					{saving ? "저장 중..." : "저장"}
				</Button>
			</div>
		</form>
	);
}
