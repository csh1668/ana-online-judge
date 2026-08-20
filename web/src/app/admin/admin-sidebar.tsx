"use client";

import {
	Bell,
	FileText,
	FolderOpen,
	FolderTree,
	Hammer,
	LayoutDashboard,
	Menu,
	ScrollText,
	Send,
	Settings,
	Tags,
	Trophy,
	Users,
	Users2,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sidebarLinks = [
	{ href: "/admin", label: "대시보드", icon: LayoutDashboard },
	{ href: "/admin/problems", label: "문제 관리", icon: FileText },
	{ href: "/admin/submissions", label: "제출 관리", icon: Send },
	{ href: "/admin/contests", label: "대회 관리", icon: Trophy },
	{ href: "/admin/sources", label: "출처 관리", icon: FolderTree },
	{ href: "/admin/tags", label: "알고리즘 태그", icon: Tags },
	{ href: "/admin/workshop", label: "창작마당", icon: Hammer },
	{ href: "/admin/workshop/groups", label: "창작마당 그룹", icon: Users2 },
	{ href: "/admin/users", label: "사용자 관리", icon: Users },
	{ href: "/admin/notifications", label: "알림 발송", icon: Bell },
	{ href: "/admin/files", label: "파일 관리", icon: FolderOpen },
	{ href: "/admin/logs", label: "서버 로그", icon: ScrollText },
	{ href: "/admin/settings", label: "사이트 설정", icon: Settings },
];

function isActive(pathname: string, href: string) {
	if (href === "/admin") return pathname === "/admin";
	return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
	return (
		<nav className="px-4 space-y-1 pb-6">
			{sidebarLinks.map((link) => {
				const active = isActive(pathname, link.href);
				return (
					<Link
						key={link.href}
						href={link.href}
						onClick={onNavigate}
						className={cn(
							"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
							active
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
						)}
					>
						<link.icon className="h-4 w-4" />
						{link.label}
					</Link>
				);
			})}
		</nav>
	);
}

export function AdminSidebar() {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	// Close drawer on route change
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is an intentional trigger — the effect must re-run on navigation
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	// Lock body scroll while drawer is open
	useEffect(() => {
		if (!open) return;
		const original = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = original;
		};
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<>
			{/* Desktop sidebar */}
			<aside className="w-64 border-r bg-muted/30 hidden md:block shrink-0">
				<div className="p-6">
					<h2 className="text-lg font-semibold flex items-center gap-2">
						<Settings className="h-5 w-5" />
						관리자
					</h2>
				</div>
				<NavList pathname={pathname} />
			</aside>

			{/* Mobile floating toggle */}
			<Button
				type="button"
				size="icon"
				className="md:hidden fixed bottom-4 left-4 z-30 h-12 w-12 rounded-full shadow-lg"
				onClick={() => setOpen(true)}
				aria-label="관리자 메뉴 열기"
			>
				<Menu className="h-5 w-5" />
			</Button>

			{/* Mobile drawer */}
			{open && (
				<div className="md:hidden fixed inset-0 z-50">
					<button
						type="button"
						aria-label="메뉴 닫기"
						className="absolute inset-0 bg-black/50 animate-in fade-in"
						onClick={() => setOpen(false)}
					/>
					<aside className="absolute top-0 left-0 h-full w-72 max-w-[85vw] bg-background border-r shadow-xl overflow-y-auto animate-in slide-in-from-left">
						<div className="p-6 flex items-center justify-between">
							<h2 className="text-lg font-semibold flex items-center gap-2">
								<Settings className="h-5 w-5" />
								관리자
							</h2>
							<Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="닫기">
								<X className="h-5 w-5" />
							</Button>
						</div>
						<NavList pathname={pathname} onNavigate={() => setOpen(false)} />
					</aside>
				</div>
			)}
		</>
	);
}
