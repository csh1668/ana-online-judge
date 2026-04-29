"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AdminMultiFilterOption = { value: string; label: string };

export function AdminMultiFilter({
	paramKey,
	options,
	className,
}: {
	paramKey: string;
	options: AdminMultiFilterOption[];
	className?: string;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const raw = searchParams.get(paramKey) ?? "";
	const selected = new Set(raw ? raw.split(",").filter(Boolean) : []);
	const [, startTransition] = useTransition();

	const toggle = (v: string) => {
		const next = new Set(selected);
		if (next.has(v)) next.delete(v);
		else next.add(v);
		const params = new URLSearchParams(searchParams.toString());
		if (next.size === 0) params.delete(paramKey);
		else params.set(paramKey, Array.from(next).join(","));
		params.set("page", "1");
		startTransition(() => router.replace(`?${params.toString()}`));
	};

	return (
		<div className={cn("flex flex-wrap gap-1.5", className)}>
			{options.map((o) => {
				const on = selected.has(o.value);
				return (
					<Button
						key={o.value}
						type="button"
						variant={on ? "default" : "outline"}
						size="sm"
						onClick={() => toggle(o.value)}
						className="h-7 px-2.5 text-xs"
					>
						{o.label}
					</Button>
				);
			})}
		</div>
	);
}
