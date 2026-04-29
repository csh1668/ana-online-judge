"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createPractice } from "@/actions/practices";
import {
	type PickerProblem,
	ProblemPickerDialog,
} from "@/components/practices/problem-picker-dialog";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRACTICE_MAX_PROBLEMS } from "@/lib/practice-utils";

function parseDateTimeLocal(s: string): Date {
	return new Date(s);
}

function formatDefaultStart(): string {
	const d = new Date();
	d.setMinutes(d.getMinutes() + 5);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day}T${hh}:${mm}`;
}

function formatDefaultEnd(): string {
	const d = new Date();
	d.setHours(d.getHours() + 2);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day}T${hh}:${mm}`;
}

export function PracticeForm() {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [startTime, setStartTime] = useState(formatDefaultStart());
	const [endTime, setEndTime] = useState(formatDefaultEnd());
	const [penaltyMinutes, setPenaltyMinutes] = useState(20);
	const [selectedProblems, setSelectedProblems] = useState<PickerProblem[]>([]);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const captchaRef = useRef<TurnstileWidgetHandle>(null);

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (!captchaToken) {
			setError("CAPTCHA 검증을 완료해주세요.");
			return;
		}
		if (selectedProblems.length === 0) {
			setError("최소 1개의 문제를 선택해주세요.");
			return;
		}
		const token = captchaToken;
		startTransition(async () => {
			try {
				const created = await createPractice(
					{
						title,
						description: description.trim() || undefined,
						startTime: parseDateTimeLocal(startTime),
						endTime: parseDateTimeLocal(endTime),
						penaltyMinutes,
						problemIds: selectedProblems.map((p) => p.id),
					},
					token
				);
				router.push(`/practices/${created.id}`);
			} catch (err) {
				captchaRef.current?.reset();
				setCaptchaToken(null);
				setError(err instanceof Error ? err.message : "연습 생성 중 오류가 발생했습니다");
			}
		});
	}

	function removeProblem(id: number) {
		setSelectedProblems((prev) => prev.filter((p) => p.id !== id));
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			{error && (
				<div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
					{error}
				</div>
			)}
			<div className="space-y-2">
				<Label htmlFor="title">제목 *</Label>
				<Input
					id="title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					required
					maxLength={200}
					placeholder="연습 제목"
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="description">설명 (선택)</Label>
				<Textarea
					id="description"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					rows={3}
				/>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="startTime">시작 시간 *</Label>
					<Input
						id="startTime"
						type="datetime-local"
						value={startTime}
						onChange={(e) => setStartTime(e.target.value)}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="endTime">종료 시간 *</Label>
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
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label>
						문제 * ({selectedProblems.length}/{PRACTICE_MAX_PROBLEMS})
					</Label>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setPickerOpen(true)}
						disabled={selectedProblems.length >= PRACTICE_MAX_PROBLEMS}
					>
						<Plus className="mr-2 h-4 w-4" />
						문제 추가
					</Button>
				</div>
				{selectedProblems.length === 0 ? (
					<div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
						아직 선택된 문제가 없습니다. "문제 추가"를 눌러 문제를 검색하고 선택하세요.
					</div>
				) : (
					<div className="rounded-md border divide-y">
						{selectedProblems.map((p, idx) => (
							<div key={p.id} className="flex items-center gap-2 px-3 py-2">
								<span className="font-mono text-xs text-muted-foreground w-6">
									{String.fromCharCode(65 + (idx % 26))}
								</span>
								<span className="font-mono text-xs text-muted-foreground w-12">{p.id}</span>
								<div className="flex-1 min-w-0">
									<ProblemTitleCell
										title={p.title}
										problemType={p.problemType}
										judgeAvailable={p.judgeAvailable}
										languageRestricted={p.languageRestricted}
										hasSubtasks={p.hasSubtasks}
										isPublic={p.isPublic}
										tier={p.tier}
									/>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									onClick={() => removeProblem(p.id)}
									aria-label="제거"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				)}
			</div>
			<div className="flex justify-center pt-1">
				<TurnstileWidget
					ref={captchaRef}
					onVerify={(token) => setCaptchaToken(token)}
					onExpire={() => setCaptchaToken(null)}
					onError={() => setCaptchaToken(null)}
				/>
			</div>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" onClick={() => router.push("/practices")}>
					취소
				</Button>
				<Button
					type="submit"
					disabled={pending || !title.trim() || !captchaToken || selectedProblems.length === 0}
				>
					{pending ? "생성 중..." : "생성"}
				</Button>
			</div>

			<ProblemPickerDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				mode="multi"
				excludeIds={selectedProblems.map((p) => p.id)}
				maxSelect={PRACTICE_MAX_PROBLEMS - selectedProblems.length}
				onConfirm={(picked) => {
					setSelectedProblems((prev) => [...prev, ...picked]);
				}}
				confirmLabel="추가"
			/>
		</form>
	);
}
