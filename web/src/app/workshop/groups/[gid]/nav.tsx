"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function GroupNav({ groupId, isOwner }: { groupId: number; isOwner: boolean }) {
	const pathname = usePathname();
	const base = `/workshop/groups/${groupId}`;
	const tabs: { href: string; label: string; show: boolean }[] = [
		{ href: `${base}`, label: "문제 목록", show: true },
		{ href: `${base}/review`, label: "모아보기", show: true },
		{ href: `${base}/members`, label: "멤버", show: true },
		{ href: `${base}/settings`, label: "설정", show: isOwner },
	];
	return (
		<nav className="flex gap-1 border-b">
			{tabs
				.filter((t) => t.show)
				.map((t) => {
					const active = pathname === t.href || (t.href === base && pathname === `${base}/`);
					return (
						<Link
							key={t.href}
							href={t.href}
							className={cn(
								"px-4 py-2 text-sm font-medium border-b-2 -mb-px",
								active
									? "border-primary text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							)}
						>
							{t.label}
						</Link>
					);
				})}
		</nav>
	);
}
