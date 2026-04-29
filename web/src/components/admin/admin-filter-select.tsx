"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type AdminFilterOption = { value: string; label: string };

export function AdminFilterSelect({
	paramKey,
	options,
	placeholder,
	allLabel = "전체",
	className,
}: {
	paramKey: string;
	options: AdminFilterOption[];
	placeholder?: string;
	allLabel?: string;
	className?: string;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const value = searchParams.get(paramKey) ?? "all";
	const [, startTransition] = useTransition();

	const onChange = (next: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (next === "all") params.delete(paramKey);
		else params.set(paramKey, next);
		params.set("page", "1");
		startTransition(() => router.replace(`?${params.toString()}`));
	};

	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className ?? "w-[150px]"}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">{allLabel}</SelectItem>
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
