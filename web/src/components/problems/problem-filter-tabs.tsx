"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "unsolved" | "solved" | "wrong" | "new";

const tabs: { value: FilterTab; label: string; requiresAuth: boolean }[] = [
	{ value: "all", label: "전체", requiresAuth: false },
	{ value: "unsolved", label: "안 푼 문제", requiresAuth: true },
	{ value: "solved", label: "맞은 문제", requiresAuth: true },
	{ value: "wrong", label: "틀린 문제", requiresAuth: true },
	{ value: "new", label: "새로 추가된 문제", requiresAuth: false },
];

const validFilters = new Set<string>(tabs.map((t) => t.value));

export function ProblemFilterTabs({ isLoggedIn }: { isLoggedIn: boolean }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentFilter = searchParams.get("filter") || "all";

	const handleTabClick = (filter: FilterTab) => {
		const params = new URLSearchParams(searchParams);
		if (filter === "all") {
			params.delete("filter");
		} else {
			params.set("filter", filter);
		}
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
						onClick={() => handleTabClick(tab.value)}
						className={cn(
							"px-3 py-1.5 text-sm rounded-md transition-colors",
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
