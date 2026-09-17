"use client";

import { usePathname } from "next/navigation";
import { type BreadcrumbEntry, PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { WORKSHOP_TABS } from "../nav";

interface Props {
	/** 창작마당 › (그룹 ›) 문제제목 — 문제제목에는 href가 있어야 탭 페이지에서 링크가 된다 */
	base: BreadcrumbEntry[];
	problemId: number;
}

export function WorkshopProblemBreadcrumb({ base, problemId }: Props) {
	const pathname = usePathname();
	const prefix = `/workshop/${problemId}`;
	const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
	const [, seg, sub] = rest.split("/");
	const tab = seg ? WORKSHOP_TABS.find((t) => t.href === `/${seg}`) : undefined;

	const items: BreadcrumbEntry[] = [...base];
	if (tab) {
		items.push(sub ? { label: tab.label, href: `${prefix}${tab.href}` } : { label: tab.label });
		if (sub) items.push({ label: `#${sub}` });
	}
	const last = items[items.length - 1];
	items[items.length - 1] = { label: last.label };
	return <PageBreadcrumb items={items} className="mb-0" />;
}
