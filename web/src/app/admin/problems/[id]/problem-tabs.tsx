"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProblemTabsProps {
	problemId: number;
}

const tabs = [
	{ name: "기본 정보", href: "" },
	{ name: "테스트케이스", href: "/testcases" },
	{ name: "설정", href: "/settings" },
];

export function ProblemTabs({ problemId }: ProblemTabsProps) {
	const pathname = usePathname();
	const basePath = `/admin/problems/${problemId}`;

	return (
		<div className="border-b">
			<nav className="flex gap-4" aria-label="Tabs">
				{tabs.map((tab) => {
					const href = `${basePath}${tab.href}`;
					const isActive = tab.href === "" ? pathname === basePath : pathname.startsWith(href);

					return (
						<Link
							key={tab.name}
							href={href}
							className={cn(
								"py-2 px-1 border-b-2 font-medium text-sm transition-colors",
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
							)}
						>
							{tab.name}
						</Link>
					);
				})}
			</nav>
		</div>
	);
}
