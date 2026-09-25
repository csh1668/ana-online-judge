"use client";

import { ChevronUp, List } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * 페이지 레일 항목.
 * - auto: 본문 내 <RailSection> 마커를 DOM 순서로 펼치는 자리표시자
 * - section: 페이지 내 섹션으로 스크롤
 * - link: 다른 페이지로 이동 (exact=false면 pathname prefix 일치 시 활성)
 *
 * label은 ReactNode다. 카운트 칩 등 부가 표시는 라벨 컴포넌트가 스스로 그린다.
 */
export type RailItem =
	| { kind: "auto" }
	| { kind: "section"; id: string; label: ReactNode }
	| { kind: "link"; href: string; label: ReactNode; exact?: boolean };

export interface PageRailProps {
	/** 기본값 [{ kind: "auto" }] */
	items?: RailItem[];
	/** links-only: 섹션·자동 항목을 숨긴다 (분할 모드용) */
	variant?: "full" | "links-only";
}

type SectionEntry = { id: string; label: ReactNode };
type LinkEntry = { href: string; label: ReactNode; exact: boolean };

/** 헤더(56px) + 여유. 활성 섹션 판정 기준선과 scroll-margin에 공통으로 쓴다. */
const HEADER_OFFSET_PX = 72;
const DEFAULT_ITEMS: RailItem[] = [{ kind: "auto" }];

/** 본문 섹션 마커. 자동 감지 대상이며 scroll-margin으로 헤더 가림을 막는다. */
export function RailSection({
	id,
	label,
	className,
	children,
}: {
	id: string;
	label: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section id={id} data-rail-label={label} className={cn("scroll-mt-[4.5rem]", className)}>
			{children}
		</section>
	);
}

function scrollBehavior(): ScrollBehavior {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function scrollToTop() {
	window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

function scrollToSection(id: string) {
	document.getElementById(id)?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
}

function useAutoSections(enabled: boolean): SectionEntry[] {
	const [sections, setSections] = useState<SectionEntry[]>([]);
	useEffect(() => {
		if (!enabled) {
			setSections([]);
			return;
		}
		const root = document.querySelector("main") ?? document.body;
		const found = Array.from(root.querySelectorAll<HTMLElement>("[data-rail-label]"))
			.filter((el) => el.id)
			.map((el) => ({ id: el.id, label: el.dataset.railLabel ?? el.id }));
		setSections(found);
	}, [enabled]);
	return sections;
}

/** "top이 기준선 이하인 마지막 섹션"을 활성으로 잡는다. */
function useActiveSection(idsKey: string): string | null {
	const [active, setActive] = useState<string | null>(null);
	const ids = useMemo(() => (idsKey ? idsKey.split("|") : []), [idsKey]);
	useEffect(() => {
		if (ids.length === 0) {
			setActive(null);
			return;
		}
		let raf = 0;
		const compute = () => {
			raf = 0;
			let current: string | null = null;
			for (const id of ids) {
				const el = document.getElementById(id);
				if (!el) continue;
				if (el.getBoundingClientRect().top <= HEADER_OFFSET_PX + 1) current = id;
			}
			setActive(current);
		};
		const onScroll = () => {
			if (raf === 0) raf = window.requestAnimationFrame(compute);
		};
		compute();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
			if (raf !== 0) window.cancelAnimationFrame(raf);
		};
	}, [ids]);
	return active;
}

function isLinkActive(pathname: string, link: LinkEntry): boolean {
	if (link.exact) return pathname === link.href;
	return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

const railItemClass =
	"block w-full truncate py-1.5 pl-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground";
const railItemActiveClass =
	"-ml-px border-l-[3px] border-primary pl-[calc(0.75rem-2px)] font-medium text-foreground";

export function PageRail(props: PageRailProps) {
	const pathname = usePathname();
	// 경로가 바뀌면 자동 감지·활성 섹션 상태를 처음부터 다시 잡는다.
	return <PageRailInner key={pathname} pathname={pathname} {...props} />;
}

function PageRailInner({
	items = DEFAULT_ITEMS,
	variant = "full",
	pathname,
}: PageRailProps & { pathname: string }) {
	const showSections = variant === "full";
	const hasAuto = showSections && items.some((i) => i.kind === "auto");
	const autoSections = useAutoSections(hasAuto);

	const { sections, links } = useMemo(() => {
		const sections: SectionEntry[] = [];
		const links: LinkEntry[] = [];
		for (const item of items) {
			if (item.kind === "link") {
				links.push({ href: item.href, label: item.label, exact: item.exact ?? false });
			} else if (!showSections) {
				// links-only: 섹션·자동 항목 무시
			} else if (item.kind === "auto") {
				sections.push(...autoSections);
			} else {
				sections.push({ id: item.id, label: item.label });
			}
		}
		return { sections, links };
	}, [items, showSections, autoSections]);

	const activeSection = useActiveSection(sections.map((s) => s.id).join("|"));

	if (!showSections && links.length === 0) return null;

	const sectionList = sections.map((s) => (
		<li key={s.id}>
			<button
				type="button"
				onClick={() => scrollToSection(s.id)}
				aria-current={activeSection === s.id ? "location" : undefined}
				className={cn(railItemClass, activeSection === s.id && railItemActiveClass)}
			>
				<span className="flex min-w-0 items-center gap-2">{s.label}</span>
			</button>
		</li>
	));

	const linkList = links.map((l) => {
		const active = isLinkActive(pathname, l);
		return (
			<li key={l.href}>
				<Link
					href={l.href}
					aria-current={active ? "page" : undefined}
					className={cn(railItemClass, active && railItemActiveClass)}
				>
					<span className="flex min-w-0 items-center gap-2">{l.label}</span>
				</Link>
			</li>
		);
	});

	return (
		<>
			{/* Desktop: 내용 왼쪽 바깥 여백에 절대 배치, 그 안에서 sticky. 내용 폭에 영향 없음.
			    필요 폭 = 컨테이너 80rem + 양쪽 (11rem 레일 + 1.5rem 간격 - 2rem 패딩) = 101rem */}
			<aside className="absolute inset-y-0 right-full mr-6 hidden w-44 min-[101rem]:block">
				<nav aria-label="페이지 내 이동" className="sticky top-[5.5rem]">
					<div className="border-l border-border">
						{sections.length > 0 && <ul>{sectionList}</ul>}
						{links.length > 0 && (
							<ul className={cn(sections.length > 0 && "mt-2 border-t border-border pt-2")}>
								{linkList}
							</ul>
						)}
					</div>
				</nav>
			</aside>

			{/* 여백이 부족한 뷰포트(모바일 포함): 좌측 하단 버튼 + 메뉴 */}
			<div className="fixed bottom-4 left-4 z-40 min-[101rem]:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="icon-lg"
							aria-label="페이지 내 이동"
							className="bg-card shadow-md"
						>
							<List className="size-5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="top" align="start" className="min-w-44">
						<DropdownMenuItem onSelect={scrollToTop}>
							<ChevronUp className="size-4" />맨 위로
						</DropdownMenuItem>
						{sections.length > 0 && <DropdownMenuSeparator />}
						{sections.map((s) => (
							<DropdownMenuItem key={s.id} onSelect={() => scrollToSection(s.id)}>
								<span className="flex min-w-0 items-center gap-2">{s.label}</span>
							</DropdownMenuItem>
						))}
						{links.length > 0 && <DropdownMenuSeparator />}
						{links.map((l) => (
							<DropdownMenuItem key={l.href} asChild>
								<Link href={l.href}>
									<span className="flex min-w-0 items-center gap-2">{l.label}</span>
								</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
