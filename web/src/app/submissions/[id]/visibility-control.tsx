"use client";

import { Globe, Lock, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { updateSubmissionVisibility } from "@/actions/submissions";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { SubmissionVisibility } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";

const ICONS: Record<SubmissionVisibility, React.ReactNode> = {
	public: <Globe className="h-4 w-4" />,
	private: <Lock className="h-4 w-4" />,
	public_on_ac: <Sparkles className="h-4 w-4" />,
};

const LABELS: Record<SubmissionVisibility, string> = {
	public: "공개",
	private: "비공개",
	public_on_ac: "맞았을 경우 공개",
};

export function VisibilityControl({
	submissionId,
	initial,
}: {
	submissionId: number;
	initial: SubmissionVisibility;
}) {
	const [value, setValue] = useState<SubmissionVisibility>(initial);
	const [isPending, startTransition] = useTransition();
	const { toast } = useToast();

	const handleChange = (next: string) => {
		const v = next as SubmissionVisibility;
		const prev = value;
		setValue(v);
		startTransition(async () => {
			const result = await updateSubmissionVisibility(submissionId, v);
			if ("error" in result && result.error) {
				setValue(prev);
				toast({ title: "변경 실패", description: result.error, variant: "destructive" });
			} else {
				toast({ title: "공개 설정 변경됨", description: LABELS[v] });
			}
		});
	};

	return (
		<Select value={value} onValueChange={handleChange} disabled={isPending}>
			<SelectTrigger className="h-8 w-[180px]">
				<SelectValue>
					<span className="flex items-center gap-2">
						{ICONS[value]}
						{LABELS[value]}
					</span>
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{(Object.keys(LABELS) as SubmissionVisibility[]).map((v) => (
					<SelectItem key={v} value={v}>
						<span className="flex items-center gap-2">
							{ICONS[v]}
							{LABELS[v]}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
