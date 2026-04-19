"use client";

import { ChevronDown, Code2, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const problemsMenu = {
	name: "문제",
	matchPrefixes: ["/problems", "/sources", "/tags", "/tiers"],
	children: [
		{ name: "전체 문제", href: "/problems" },
		{ name: "문제 출처", href: "/sources" },
		{ name: "알고리즘 분류", href: "/tags" },
		{ name: "난이도 분류", href: "/tiers" },
	],
};

const navigation = [
	{ name: "대회", href: "/contests" },
	{ name: "제출 현황", href: "/submissions" },
	{ name: "랭킹", href: "/ranking" },
	{ name: "플레이그라운드", href: "/playground" },
	{ name: "창작마당", href: "/workshop" },
];

export function Header() {
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [desktopProblemsOpen, setDesktopProblemsOpen] = useState(false);
	const [mobileProblemsOpen, setMobileProblemsOpen] = useState(false);

	const problemsActive = problemsMenu.matchPrefixes.some((p) => pathname.startsWith(p));

	return (
		<header className="sticky top-0 z-50 w-full bg-header text-header-foreground">
			<nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
				{/* Logo */}
				<div className="flex items-center gap-2">
					<Link href="/" className="flex items-center gap-2 font-mulmaru">
						<Code2 className="size-6" />
						<span className="text-2xl leading-none">AOJ</span>
					</Link>
				</div>

				{/* Desktop Navigation */}
				<div className="hidden md:flex md:items-center md:gap-0 h-full">
					{/* 문제 dropdown */}
					{/** biome-ignore lint/a11y/noStaticElementInteractions: hover wrapper covers trigger+content; keyboard users interact via the inner button/links */}
					<div
						className="relative h-full"
						onMouseEnter={() => setDesktopProblemsOpen(true)}
						onMouseLeave={() => setDesktopProblemsOpen(false)}
					>
						<button
							type="button"
							onClick={() => setDesktopProblemsOpen((v) => !v)}
							aria-expanded={desktopProblemsOpen}
							aria-haspopup="true"
							className={cn(
								"relative flex items-center h-full gap-1 px-4 text-sm font-medium transition-colors",
								problemsActive
									? "text-header-foreground font-semibold after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[3px] after:bg-header-foreground"
									: "text-header-foreground/70 hover:text-header-foreground"
							)}
						>
							{problemsMenu.name}
							<ChevronDown
								className={cn("size-3.5 transition-transform", desktopProblemsOpen && "rotate-180")}
							/>
						</button>
						{desktopProblemsOpen && (
							<div className="absolute left-0 top-full min-w-[8rem] rounded-[2px] border border-border bg-popover py-1 text-popover-foreground shadow-md">
								{problemsMenu.children.map((child) => (
									<Link
										key={child.href}
										href={child.href}
										onClick={() => setDesktopProblemsOpen(false)}
										className="block px-3 py-1.5 text-sm hover:bg-secondary"
									>
										{child.name}
									</Link>
								))}
							</div>
						)}
					</div>

					{navigation.map((item) => {
						const active = pathname.startsWith(item.href);
						return (
							<Link
								key={item.name}
								href={item.href}
								className={cn(
									"relative flex items-center h-full px-4 text-sm font-medium transition-colors",
									active
										? "text-header-foreground font-semibold after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[3px] after:bg-header-foreground"
										: "text-header-foreground/70 hover:text-header-foreground"
								)}
							>
								{item.name}
							</Link>
						);
					})}
				</div>

				{/* Right side — Auth & Theme */}
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<div className="hidden md:block">
						<UserMenu />
					</div>

					{/* Mobile menu button */}
					<Button
						variant="ghost"
						size="icon"
						className="md:hidden text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					>
						{mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
					</Button>
				</div>
			</nav>

			{/* Mobile Navigation */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-header-foreground/20">
					<div className="space-y-1 px-4 py-3">
						{/* 문제 collapsible */}
						<button
							type="button"
							onClick={() => setMobileProblemsOpen((v) => !v)}
							aria-expanded={mobileProblemsOpen}
							className={cn(
								"flex w-full items-center justify-between px-3 py-2 text-base font-medium rounded-[2px]",
								problemsActive
									? "bg-header-foreground/10 text-header-foreground font-semibold"
									: "text-header-foreground/80 hover:bg-header-foreground/10"
							)}
						>
							<span>{problemsMenu.name}</span>
							<ChevronDown
								className={cn("size-4 transition-transform", mobileProblemsOpen && "rotate-180")}
							/>
						</button>
						{mobileProblemsOpen && (
							<div className="space-y-1 pl-4">
								{problemsMenu.children.map((child) => (
									<Link
										key={child.href}
										href={child.href}
										onClick={() => {
											setMobileMenuOpen(false);
											setMobileProblemsOpen(false);
										}}
										className={cn(
											"block px-3 py-2 text-base font-medium rounded-[2px]",
											pathname.startsWith(child.href)
												? "bg-header-foreground/10 text-header-foreground font-semibold"
												: "text-header-foreground/80 hover:bg-header-foreground/10"
										)}
									>
										{child.name}
									</Link>
								))}
							</div>
						)}

						{navigation.map((item) => (
							<Link
								key={item.name}
								href={item.href}
								className={cn(
									"block px-3 py-2 text-base font-medium rounded-[2px]",
									pathname.startsWith(item.href)
										? "bg-header-foreground/10 text-header-foreground font-semibold"
										: "text-header-foreground/80 hover:bg-header-foreground/10"
								)}
								onClick={() => setMobileMenuOpen(false)}
							>
								{item.name}
							</Link>
						))}
						<div className="pt-4 border-t border-header-foreground/20 mt-4">
							<UserMenu />
						</div>
					</div>
				</div>
			)}
		</header>
	);
}
