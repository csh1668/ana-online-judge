"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
	{ href: "", label: "개요" },
	{ href: "/statement", label: "지문" },
	{ href: "/testcases", label: "테스트" },
	{ href: "/generators", label: "제너레이터" },
	{ href: "/resources", label: "리소스" },
	{ href: "/checker", label: "체커" },
	{ href: "/validator", label: "밸리데이터" },
	{ href: "/solutions", label: "솔루션" },
	{ href: "/invocations", label: "인보케이션" },
	{ href: "/snapshots", label: "스냅샷" },
	{ href: "/members", label: "멤버" },
];

export function WorkshopProblemNav({ problemId }: { problemId: number }) {
	const pathname = usePathname();
	const base = `/workshop/${problemId}`;
	return (
		<nav className="border-b mb-6">
			<ul className="flex gap-1 overflow-x-auto">
				{TABS.map((t) => {
					const href = `${base}${t.href}`;
					const active = pathname === href;
					return (
						<li key={t.href}>
							<Link
								href={href}
								className={cn(
									"block px-3 py-2 text-sm border-b-2 whitespace-nowrap",
									active
										? "border-primary text-primary font-medium"
										: "border-transparent text-muted-foreground hover:text-foreground"
								)}
							>
								{t.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
