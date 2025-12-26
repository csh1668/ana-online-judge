import { FileText, LayoutDashboard, Settings, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { cn } from "@/lib/utils";

const sidebarLinks = [
	{ href: "/admin", label: "대시보드", icon: LayoutDashboard },
	{ href: "/admin/problems", label: "문제 관리", icon: FileText },
	{ href: "/admin/contests", label: "대회 관리", icon: Trophy },
	{ href: "/admin/users", label: "사용자 관리", icon: Users },
	{ href: "/admin/settings", label: "사이트 설정", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
	const session = await auth();

	if (!session?.user) {
		redirect("/login");
	}

	if (session.user.role !== "admin") {
		redirect("/");
	}

	return (
		<div className="flex min-h-[calc(100vh-4rem)]">
			{/* Sidebar */}
			<aside className="w-64 border-r bg-muted/30 hidden md:block">
				<div className="p-6">
					<h2 className="text-lg font-semibold flex items-center gap-2">
						<Settings className="h-5 w-5" />
						관리자
					</h2>
				</div>
				<nav className="px-4 space-y-1">
					{sidebarLinks.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							className={cn(
								"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
								"hover:bg-accent hover:text-accent-foreground",
								"text-muted-foreground"
							)}
						>
							<link.icon className="h-4 w-4" />
							{link.label}
						</Link>
					))}
				</nav>
			</aside>

			{/* Main Content */}
			<main className="flex-1 p-6">{children}</main>
		</div>
	);
}
