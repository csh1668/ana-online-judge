"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

export function AdminDateRange({ className }: { className?: string }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const from = searchParams.get("dateFrom") ?? "";
	const to = searchParams.get("dateTo") ?? "";
	const [, startTransition] = useTransition();

	const set = (key: "dateFrom" | "dateTo", value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (value) params.set(key, value);
		else params.delete(key);
		params.set("page", "1");
		startTransition(() => router.replace(`?${params.toString()}`));
	};

	return (
		<div className={`flex items-center gap-1 ${className ?? ""}`}>
			<Input
				type="date"
				value={from}
				onChange={(e) => set("dateFrom", e.target.value)}
				className="w-[150px]"
			/>
			<span className="text-muted-foreground">~</span>
			<Input
				type="date"
				value={to}
				onChange={(e) => set("dateTo", e.target.value)}
				className="w-[150px]"
			/>
		</div>
	);
}
