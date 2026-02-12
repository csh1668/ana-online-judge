"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface SortableHeaderProps {
	label: string;
	sortKey: string;
	className?: string;
}

export function SortableHeader({ label, sortKey, className }: SortableHeaderProps) {
	const searchParams = useSearchParams();
	const currentSort = searchParams.get("sort") || "id";
	const currentOrder = searchParams.get("order") || "asc";

	const isCurrent = currentSort === sortKey;
	const nextOrder = isCurrent && currentOrder === "asc" ? "desc" : "asc";

	const params = new URLSearchParams(searchParams);
	params.set("sort", sortKey);
	params.set("order", nextOrder);

	return (
		<Link
			href={`?${params.toString()}`}
			className={cn(
				"flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer select-none",
				className
			)}
		>
			{label}
			{isCurrent ? (
				currentOrder === "asc" ? (
					<ArrowUp className="h-4 w-4" />
				) : (
					<ArrowDown className="h-4 w-4" />
				)
			) : (
				<ChevronsUpDown className="h-4 w-4 opacity-50" />
			)}
		</Link>
	);
}
