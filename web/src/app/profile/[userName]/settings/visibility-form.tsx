"use client";

import { useEffect, useState, useTransition } from "react";
import { updateDefaultSubmissionVisibility } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { SubmissionVisibility } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";

const OPTIONS: { value: SubmissionVisibility; label: string; desc: string }[] = [
	{
		value: "public",
		label: "공개",
		desc: "다른 사용자가 그 문제를 풀었으면 소스코드를 볼 수 있어요.",
	},
	{
		value: "private",
		label: "비공개",
		desc: "본인과 관리자만 소스코드를 볼 수 있어요.",
	},
	{
		value: "public_on_ac",
		label: "맞았을 경우 공개",
		desc: "이 제출이 만점일 때만 푼 사용자에게 소스코드가 공개돼요.",
	},
];

export function VisibilityForm({ initial }: { initial: SubmissionVisibility }) {
	const [saved, setSaved] = useState<SubmissionVisibility>(initial);
	const [value, setValue] = useState<SubmissionVisibility>(initial);
	const [isPending, startTransition] = useTransition();
	const { toast } = useToast();

	useEffect(() => {
		setSaved(initial);
		setValue(initial);
	}, [initial]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		startTransition(async () => {
			const result = await updateDefaultSubmissionVisibility(value);
			if ("error" in result && result.error) {
				toast({
					title: "저장 실패",
					description: result.error,
					variant: "destructive",
				});
			} else {
				setSaved(value);
				toast({
					title: "저장됨",
					description: "기본 공개 설정이 변경됐어요.",
				});
			}
		});
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<RadioGroup
				value={value}
				onValueChange={(v) => setValue(v as SubmissionVisibility)}
				className="space-y-3"
			>
				{OPTIONS.map((opt) => (
					<div key={opt.value} className="flex items-start gap-3">
						<RadioGroupItem id={`vis-${opt.value}`} value={opt.value} className="mt-1" />
						<div className="space-y-1">
							<Label htmlFor={`vis-${opt.value}`} className="font-medium">
								{opt.label}
							</Label>
							<p className="text-sm text-muted-foreground">{opt.desc}</p>
						</div>
					</div>
				))}
			</RadioGroup>
			<Button type="submit" disabled={isPending || value === saved}>
				{isPending ? "저장 중..." : "저장"}
			</Button>
		</form>
	);
}
