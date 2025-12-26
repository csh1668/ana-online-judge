"use client";

import { LogOut, Settings, Shield, User } from "lucide-react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
	user?: Session["user"];
}

export function UserMenu({ user }: UserMenuProps) {
	const { data: session } = useSession();
	const currentUser = session?.user || user;

	if (!currentUser) {
		return (
			<div className="flex items-center gap-2">
				<Button variant="ghost" asChild>
					<Link href="/login">로그인</Link>
				</Button>
				<Button asChild>
					<Link href="/register">회원가입</Link>
				</Button>
			</div>
		);
	}

	const initials =
		currentUser.name
			?.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2) || "U";

	const isAdmin = currentUser.role === "admin";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="relative h-9 w-9 rounded-full">
					<Avatar className="h-9 w-9">
						<AvatarFallback className="bg-primary text-primary-foreground">
							{initials}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="end" forceMount>
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium leading-none">{currentUser.name}</p>
						<p className="text-xs leading-none text-muted-foreground">{currentUser.email}</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/profile" className="cursor-pointer">
						<User className="mr-2 h-4 w-4" />
						프로필
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link href="/submissions?me=true" className="cursor-pointer">
						<Settings className="mr-2 h-4 w-4" />내 제출
					</Link>
				</DropdownMenuItem>
				{isAdmin && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link href="/admin" className="cursor-pointer">
								<Shield className="mr-2 h-4 w-4" />
								관리자
							</Link>
						</DropdownMenuItem>
					</>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer text-destructive focus:text-destructive"
					onClick={() => signOut({ callbackUrl: "/" })}
				>
					<LogOut className="mr-2 h-4 w-4" />
					로그아웃
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
