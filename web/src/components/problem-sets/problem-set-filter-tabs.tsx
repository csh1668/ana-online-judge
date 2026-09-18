"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "liked" | "mine";

const tabs: { value: FilterTab; label: string; requiresAuth: boolean }[] = [
	{ value: "all", label: "전체", requiresAuth: false },
	{ value: "liked", label: "좋아요", requiresAuth: true },
	{ value: "mine", label: "내 문제집", requiresAuth: true },
];

const validFilters = new Set<string>(tabs.map((t) => t.value));

export function ProblemSetFilterTabs({ isLoggedIn }: { isLoggedIn: boolean }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentFilter = searchParams.get("filter") || "all";

	const handleClick = (filter: FilterTab) => {
		const params = new URLSearchParams(searchParams);
		if (filter === "all") params.delete("filter");
		else params.set("filter", filter);
		params.set("page", "1");
		router.push(`?${params.toString()}`);
	};

	const visibleTabs = tabs.filter((t) => !t.requiresAuth || isLoggedIn);

	return (
		<div className="flex gap-1 flex-wrap">
			{visibleTabs.map((tab) => {
				const isActive =
					tab.value === currentFilter || (tab.value === "all" && !validFilters.has(currentFilter));
				return (
					<button
						key={tab.value}
						type="button"
						onClick={() => handleClick(tab.value)}
						className={cn(
							"px-3 py-1.5 text-sm rounded-[2px] transition-colors",
							isActive
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
						)}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
