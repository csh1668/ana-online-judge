"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const WORKSHOP_TABS = [
	{ href: "", label: "개요" },
	{ href: "/statement", label: "지문" },
	{ href: "/testcases", label: "테스트" },
	{ href: "/generators", label: "제너레이터" },
	{ href: "/resources", label: "리소스" },
	{ href: "/checker", label: "체커" },
	{ href: "/validator", label: "밸리데이터" },
	{ href: "/transformer", label: "변환기" },
	{ href: "/solutions", label: "솔루션" },
	{ href: "/invocations", label: "인보케이션" },
	{ href: "/snapshots", label: "스냅샷" },
	{ href: "/members", label: "멤버" },
];

export function WorkshopProblemNav({ problemId }: { problemId: number }) {
	const pathname = usePathname();
	const base = `/workshop/${problemId}`;
	return (
		<nav className="border-b border-border">
			<ul className="flex gap-1 overflow-x-auto">
				{WORKSHOP_TABS.map((t) => {
					const href = `${base}${t.href}`;
					const active =
						t.href === ""
							? pathname === href
							: pathname === href || pathname.startsWith(`${href}/`);
					return (
						<li key={t.href}>
							<Link
								href={href}
								className={cn(
									"block whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-medium transition-colors -mb-px",
									active
										? "border-primary text-foreground font-semibold"
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
