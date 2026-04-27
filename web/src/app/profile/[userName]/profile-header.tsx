"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { TierBadge } from "@/components/tier/tier-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { UserStats } from "@/lib/services/user-stats";
import { ratingToUserTier } from "@/lib/tier";

type ProfileUser = {
	id: number;
	username: string;
	name: string;
	bio: string | null;
	avatarUrl: string | null;
	rating: number | null;
	createdAt: Date;
};

export function ProfileHeader({
	user,
	stats,
	isOwner,
}: {
	user: ProfileUser;
	stats: UserStats;
	isOwner: boolean;
}) {
	const initials = user.name.slice(0, 2).toUpperCase();

	const joinDate = new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(user.createdAt);

	return (
		<Card className="w-full">
			<CardContent className="flex flex-col sm:flex-row gap-6 p-6">
				<Avatar className="h-24 w-24 shrink-0">
					<AvatarImage src={user.avatarUrl ?? undefined} alt={user.username} />
					<AvatarFallback className="text-2xl">{initials}</AvatarFallback>
				</Avatar>

				<div className="flex-1 min-w-0 space-y-3">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold">{user.name}</h1>
						<div className="flex items-center gap-2">
							<TierBadge tier={ratingToUserTier(user.rating ?? 0)} kind="user" size="md" />
							<span className="text-sm text-muted-foreground">Rating {user.rating ?? 0}</span>
						</div>
						{isOwner && (
							<Button size="sm" variant="ghost" asChild>
								<Link href="/settings" aria-label="설정">
									<Settings className="h-4 w-4" />
								</Link>
							</Button>
						)}
					</div>
					{user.bio && <p className="text-muted-foreground">{user.bio}</p>}
					<p className="text-sm text-muted-foreground">{joinDate} 가입</p>

					<div className="flex gap-6 pt-2">
						<div className="text-center">
							<div className="text-2xl font-bold">{stats.solvedCount}</div>
							<div className="text-sm text-muted-foreground">푼 문제</div>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold">{stats.submissionCount}</div>
							<div className="text-sm text-muted-foreground">제출</div>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold">{stats.acceptRate}%</div>
							<div className="text-sm text-muted-foreground">정답률</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
