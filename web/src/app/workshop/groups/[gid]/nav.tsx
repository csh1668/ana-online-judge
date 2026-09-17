"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const GROUP_TABS = [
	{ href: "", label: "문제 목록", ownerOnly: false },
	{ href: "/review", label: "모아보기", ownerOnly: false },
	{ href: "/members", label: "멤버", ownerOnly: false },
	{ href: "/settings", label: "설정", ownerOnly: true },
] as const;

export function GroupNav({ groupId, isOwner }: { groupId: number; isOwner: boolean }) {
	const pathname = usePathname();
	const base = `/workshop/groups/${groupId}`;
	return (
		<nav className="flex gap-1 border-b border-border overflow-x-auto">
			{GROUP_TABS.filter((t) => !t.ownerOnly || isOwner).map((t) => {
				const href = `${base}${t.href}`;
				const active =
					t.href === "" ? pathname === href || pathname === `${href}/` : pathname === href;
				return (
					<Link
						key={t.href}
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
				);
			})}
		</nav>
	);
}
