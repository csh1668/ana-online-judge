"use client";

import { Code2, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
	{ name: "문제", href: "/problems" },
	{ name: "대회", href: "/contests" },
	{ name: "제출 현황", href: "/submissions" },
	{ name: "Playground", href: "/playground" },
];

export function Header() {
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
				{/* Logo */}
				<div className="flex items-center gap-2">
					<Link href="/" className="flex items-center gap-2">
						<Code2 className="h-8 w-8 text-primary" />
						<span className="text-xl font-bold tracking-tight">AOJ</span>
					</Link>
				</div>

				{/* Desktop Navigation */}
				<div className="hidden md:flex md:items-center md:gap-1">
					{navigation.map((item) => (
						<Link
							key={item.name}
							href={item.href}
							className={cn(
								"px-4 py-2 text-sm font-medium transition-colors rounded-md",
								pathname.startsWith(item.href)
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50"
							)}
						>
							{item.name}
						</Link>
					))}
				</div>

				{/* Right side - Auth & Theme */}
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<div className="hidden md:block">
						<UserMenu />
					</div>

					{/* Mobile menu button */}
					<Button
						variant="ghost"
						size="icon"
						className="md:hidden"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					>
						{mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
					</Button>
				</div>
			</nav>

			{/* Mobile Navigation */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t">
					<div className="space-y-1 px-4 py-3">
						{navigation.map((item) => (
							<Link
								key={item.name}
								href={item.href}
								className={cn(
									"block px-3 py-2 text-base font-medium rounded-md",
									pathname.startsWith(item.href)
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-accent/50"
								)}
								onClick={() => setMobileMenuOpen(false)}
							>
								{item.name}
							</Link>
						))}
						<div className="pt-4 border-t mt-4">
							<UserMenu />
						</div>
					</div>
				</div>
			)}
		</header>
	);
}
