"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePractice } from "@/actions/practices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Practice = {
	id: number;
	title: string;
	description: string | null;
	startTime: Date;
	endTime: Date;
	penaltyMinutes: number;
};

function formatDateTimeLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day}T${hh}:${mm}`;
}

export function PracticeEditForm({ practice }: { practice: Practice }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [title, setTitle] = useState(practice.title);
	const [description, setDescription] = useState(practice.description ?? "");
	const [startTime, setStartTime] = useState(formatDateTimeLocal(practice.startTime));
	const [endTime, setEndTime] = useState(formatDateTimeLocal(practice.endTime));
	const [penaltyMinutes, setPenaltyMinutes] = useState(practice.penaltyMinutes);

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				await updatePractice(practice.id, {
					title,
					description: description.trim() || undefined,
					startTime: new Date(startTime),
					endTime: new Date(endTime),
					penaltyMinutes,
				});
				router.refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "수정 중 오류가 발생했습니다");
			}
		});
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			{error && (
				<div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
					{error}
				</div>
			)}
			<div className="space-y-2">
				<Label htmlFor="title">제목</Label>
				<Input
					id="title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					required
					maxLength={200}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="description">설명</Label>
				<Textarea
					id="description"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					rows={3}
				/>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="startTime">시작 시간</Label>
					<Input
						id="startTime"
						type="datetime-local"
						value={startTime}
						onChange={(e) => setStartTime(e.target.value)}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="endTime">종료 시간</Label>
					<Input
						id="endTime"
						type="datetime-local"
						value={endTime}
						onChange={(e) => setEndTime(e.target.value)}
						required
					/>
				</div>
			</div>
			<div className="space-y-2">
				<Label htmlFor="penaltyMinutes">패널티 (분)</Label>
				<Input
					id="penaltyMinutes"
					type="number"
					min={0}
					value={penaltyMinutes}
					onChange={(e) => {
						const v = e.currentTarget.valueAsNumber;
						if (Number.isFinite(v)) setPenaltyMinutes(v);
					}}
				/>
			</div>
			<div className="flex justify-end">
				<Button type="submit" disabled={pending}>
					{pending ? "저장 중..." : "저장"}
				</Button>
			</div>
		</form>
	);
}
