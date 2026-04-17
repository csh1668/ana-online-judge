"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { setPlaygroundQuota, setWorkshopQuota } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QuotaStepperProps {
	userId: number;
	kind: "playground" | "workshop";
	quota: number;
	usage: number;
	isAdmin: boolean;
}

export function QuotaStepper({ userId, kind, quota, usage, isAdmin }: QuotaStepperProps) {
	const [value, setValue] = useState(quota);
	const [isPending, startTransition] = useTransition();
	const lastSavedRef = useRef(quota);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setValue(quota);
		lastSavedRef.current = quota;
	}, [quota]);

	if (isAdmin) {
		return <span className="text-sm text-muted-foreground">무제한</span>;
	}

	const save = (next: number) => {
		if (next === lastSavedRef.current) return;
		startTransition(async () => {
			try {
				const action = kind === "playground" ? setPlaygroundQuota : setWorkshopQuota;
				await action(userId, next);
				lastSavedRef.current = next;
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "한도 저장 실패");
				setValue(lastSavedRef.current);
			}
		});
	};

	const scheduleSave = (next: number) => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => save(next), 500);
	};

	const commit = (next: number) => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		save(next);
	};

	const clamp = (n: number) => Math.max(0, Math.floor(n));

	return (
		<div className="flex items-center gap-1.5">
			<Button
				size="icon"
				variant="outline"
				className="h-7 w-7"
				disabled={isPending || value <= 0}
				onClick={() => {
					const next = clamp(value - 1);
					setValue(next);
					commit(next);
				}}
				aria-label="감소"
			>
				<Minus className="h-3 w-3" />
			</Button>
			<Input
				type="number"
				min={0}
				className="h-7 w-14 text-center"
				value={value}
				onChange={(e) => {
					const parsed = clamp(Number.parseInt(e.target.value, 10) || 0);
					setValue(parsed);
					scheduleSave(parsed);
				}}
				onBlur={() => commit(value)}
				disabled={isPending}
			/>
			<Button
				size="icon"
				variant="outline"
				className="h-7 w-7"
				disabled={isPending}
				onClick={() => {
					const next = clamp(value + 1);
					setValue(next);
					commit(next);
				}}
				aria-label="증가"
			>
				<Plus className="h-3 w-3" />
			</Button>
			<span className="text-xs text-muted-foreground ml-1">
				({usage}/{value})
			</span>
		</div>
	);
}
