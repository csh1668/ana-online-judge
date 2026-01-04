"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createContest, updateContest } from "@/actions/contests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Contest } from "@/db/schema";

type ContestFormProps = {
	contest?: Contest;
};

export function ContestForm({ contest }: ContestFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const formData = new FormData(e.currentTarget);

		// Convert datetime-local input to UTC Date
		// datetime-local input uses browser's local timezone
		function parseDateTimeLocal(dateTimeString: string): Date {
			// datetime-local input is in format "YYYY-MM-DDTHH:mm"
			// It's interpreted in browser's local timezone
			// JavaScript Date constructor automatically converts to UTC
			return new Date(dateTimeString);
		}

		try {
			const data = {
				title: formData.get("title") as string,
				description: formData.get("description") as string,
				startTime: parseDateTimeLocal(formData.get("startTime") as string),
				endTime: parseDateTimeLocal(formData.get("endTime") as string),
				freezeMinutes: formData.get("freezeMinutes")
					? Number.parseInt(formData.get("freezeMinutes") as string, 10)
					: null,
				visibility: formData.get("visibility") as "public" | "private",
				scoreboardType: formData.get("scoreboardType") as "basic" | "spotboard",
				penaltyMinutes: Number.parseInt(formData.get("penaltyMinutes") as string, 10),
			};

			if (contest) {
				await updateContest(contest.id, data);
				router.push(`/admin/contests/${contest.id}`);
			} else {
				const newContest = await createContest(data);
				router.push(`/admin/contests/${newContest.id}`);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "오류가 발생했습니다");
			setIsSubmitting(false);
		}
	}

	// Format date for datetime-local input
	// Convert UTC date to local timezone for display
	function formatDateTimeLocal(date: Date) {
		// Use local timezone (browser's timezone)
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{error && (
				<div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">{error}</div>
			)}

			<div className="space-y-2">
				<Label htmlFor="title">대회 제목 *</Label>
				<Input
					id="title"
					name="title"
					defaultValue={contest?.title}
					required
					placeholder="대회 제목을 입력하세요"
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="description">설명</Label>
				<Textarea
					id="description"
					name="description"
					defaultValue={contest?.description || ""}
					placeholder="대회에 대한 설명을 입력하세요"
					rows={4}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="startTime">시작 시간 *</Label>
					<Input
						id="startTime"
						name="startTime"
						type="datetime-local"
						defaultValue={contest ? formatDateTimeLocal(contest.startTime) : ""}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="endTime">종료 시간 *</Label>
					<Input
						id="endTime"
						name="endTime"
						type="datetime-local"
						defaultValue={contest ? formatDateTimeLocal(contest.endTime) : ""}
						required
					/>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="visibility">공개 범위 *</Label>
					<Select name="visibility" defaultValue={contest?.visibility || "public"}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="public">공개</SelectItem>
							<SelectItem value="private">비공개</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="scoreboardType">스코어보드 타입 *</Label>
					<Select name="scoreboardType" defaultValue={contest?.scoreboardType || "basic"}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="basic">기본</SelectItem>
							<SelectItem value="spotboard">Spotboard</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="penaltyMinutes">패널티 (분) *</Label>
					<Input
						id="penaltyMinutes"
						name="penaltyMinutes"
						type="number"
						min="0"
						defaultValue={contest?.penaltyMinutes || 20}
						required
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="freezeMinutes">프리즈 시간 (종료 N분 전, 0이면 프리즈 없음)</Label>
				<Input
					id="freezeMinutes"
					name="freezeMinutes"
					type="number"
					min="0"
					defaultValue={contest?.freezeMinutes || 60}
				/>
			</div>

			<div className="flex gap-2">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "저장 중..." : contest ? "수정하기" : "생성하기"}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() => router.back()}
					disabled={isSubmitting}
				>
					취소
				</Button>
			</div>
		</form>
	);
}
