"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function AdminSortableHeader({
	sortKey,
	children,
	className,
}: {
	sortKey: string;
	children: React.ReactNode;
	className?: string;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentSort = searchParams.get("sort");
	const currentOrder = searchParams.get("order") ?? "desc";
	const isActive = currentSort === sortKey;
	const [, startTransition] = useTransition();

	const onClick = () => {
		const params = new URLSearchParams(searchParams.toString());
		if (isActive) {
			params.set("order", currentOrder === "asc" ? "desc" : "asc");
		} else {
			params.set("sort", sortKey);
			params.set("order", "desc");
		}
		params.set("page", "1");
		startTransition(() => router.replace(`?${params.toString()}`));
	};

	const Icon = !isActive ? ArrowUpDown : currentOrder === "asc" ? ArrowUp : ArrowDown;

	return (
		<TableHead className={className}>
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"inline-flex items-center gap-1 hover:text-foreground transition-colors",
					isActive ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{children}
				<Icon className="h-3.5 w-3.5" />
			</button>
		</TableHead>
	);
}
