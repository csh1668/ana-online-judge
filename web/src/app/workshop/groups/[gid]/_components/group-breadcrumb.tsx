"use client";

import { usePathname } from "next/navigation";
import { type BreadcrumbEntry, PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { GROUP_TABS } from "../nav";

export function GroupBreadcrumb({ base, groupId }: { base: BreadcrumbEntry[]; groupId: number }) {
	const pathname = usePathname();
	const prefix = `/workshop/groups/${groupId}`;
	const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
	const tab = GROUP_TABS.find((t) => t.href !== "" && rest.startsWith(t.href));
	const items: BreadcrumbEntry[] = tab
		? [...base, { label: tab.label }]
		: base.map((b, i) => (i === base.length - 1 ? { label: b.label } : b));
	return <PageBreadcrumb items={items} className="mb-0" />;
}
