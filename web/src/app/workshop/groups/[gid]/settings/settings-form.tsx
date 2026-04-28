"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGroup, updateGroup } from "@/actions/workshop/groups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SettingsForm({
	groupId,
	name: initialName,
	description: initialDescription,
	publishedCount,
	unpublishedCount,
}: {
	groupId: number;
	name: string;
	description: string;
	publishedCount: number;
	unpublishedCount: number;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription);

	function onSave() {
		setError(null);
		startTransition(async () => {
			try {
				await updateGroup(groupId, { name, description });
				router.refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "저장 실패");
			}
		});
	}

	function onDelete() {
		const msg =
			`정말 그룹을 삭제하시겠습니까?\n\n` +
			`- 미출판 문제 ${unpublishedCount}개가 영구 삭제됩니다 (MinIO 데이터 포함).\n` +
			`- 출판된 문제 ${publishedCount}개는 보존됩니다 (그룹에서만 분리).\n\n` +
			`되돌릴 수 없습니다.`;
		if (!confirm(msg)) return;
		setError(null);
		startTransition(async () => {
			try {
				await deleteGroup(groupId);
				router.push("/workshop");
			} catch (err) {
				setError(err instanceof Error ? err.message : "그룹 삭제 실패");
			}
		});
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">기본 정보</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<Label htmlFor="name">그룹 이름</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={100}
						/>
					</div>
					<div>
						<Label htmlFor="description">설명</Label>
						<Textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							maxLength={1000}
							rows={4}
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<div className="flex justify-end">
						<Button onClick={onSave} disabled={pending || !name.trim()}>
							저장
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card className="border-destructive">
				<CardHeader>
					<CardTitle className="text-lg text-destructive">위험 영역</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-sm text-muted-foreground">
						그룹을 삭제하면 미출판 문제 {unpublishedCount}개가 영구 삭제됩니다. 출판된{" "}
						{publishedCount}개는 보존됩니다.
					</p>
					<Button variant="destructive" onClick={onDelete} disabled={pending}>
						그룹 삭제
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
