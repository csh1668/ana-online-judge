"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
	getMyNotifications,
	getUnreadNotificationCount,
	markNotificationsReadAction,
} from "@/actions/notifications";
import {
	NotificationItem,
	type NotificationItemData,
} from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const POLL_MS = 45_000;

export function NotificationBell() {
	const { status } = useSession();
	const [unread, setUnread] = useState(0);
	const [items, setItems] = useState<NotificationItemData[]>([]);
	const [newIds, setNewIds] = useState<Set<number>>(new Set());

	const refreshCount = useCallback(async () => {
		if (document.visibilityState !== "visible") return;
		setUnread(await getUnreadNotificationCount());
	}, []);

	// 폴링 (탭이 백그라운드면 일시정지)
	useEffect(() => {
		if (status !== "authenticated") return;
		refreshCount();
		const id = setInterval(refreshCount, POLL_MS);
		const onVis = () => refreshCount();
		document.addEventListener("visibilitychange", onVis);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onVis);
		};
	}, [status, refreshCount]);

	const onOpenChange = async (open: boolean) => {
		if (!open) return;
		const { items: list } = await getMyNotifications(1);
		const data: NotificationItemData[] = list.slice(0, 15).map((n) => ({
			id: n.id,
			body: n.body,
			readAt: n.readAt,
			createdAt: n.createdAt,
		}));
		const freshUnread = data.filter((n) => n.readAt === null).map((n) => n.id);
		setItems(data);
		setNewIds(new Set(freshUnread));
		if (freshUnread.length > 0) {
			await markNotificationsReadAction(freshUnread);
			setUnread(0);
		}
	};

	if (status !== "authenticated") return null;

	return (
		<DropdownMenu onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
					aria-label="알림"
				>
					<Bell className="h-5 w-5" />
					{unread > 0 && (
						<span className="absolute -top-0.5 -right-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-[2px] bg-destructive px-1 text-[0.65rem] font-semibold text-destructive-foreground">
							{unread > 99 ? "99+" : unread}
						</span>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80 p-0">
				<div className="px-4 py-2 border-b font-semibold text-sm">알림</div>
				<div className="max-h-96 overflow-y-auto">
					{items.length === 0 ? (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground">
							알림이 없습니다.
						</div>
					) : (
						items.map((n) => (
							<NotificationItem key={n.id} data={n} alreadyRead={!newIds.has(n.id)} />
						))
					)}
				</div>
				<Link
					href="/notifications"
					className="block px-4 py-2 border-t text-center text-sm text-primary hover:bg-accent"
				>
					모든 알림 보기 →
				</Link>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
