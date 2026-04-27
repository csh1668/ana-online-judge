"use client";

import { Pencil, Save, Settings, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { updateProfile } from "@/actions/profile";
import { TierBadge } from "@/components/tier/tier-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
	const { update: updateSession } = useSession();
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(user.name);
	const [bio, setBio] = useState(user.bio ?? "");
	const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
	const [isPending, startTransition] = useTransition();

	const initials = user.name.slice(0, 2).toUpperCase();

	const handleSave = () => {
		startTransition(async () => {
			const trimmedName = name.trim();
			const nextAvatarUrl = avatarUrl.trim() || null;
			await updateProfile({
				name: trimmedName,
				bio: bio.trim() || null,
				avatarUrl: nextAvatarUrl,
			});
			if (isOwner) {
				await updateSession({ name: trimmedName, avatarUrl: nextAvatarUrl });
			}
			setEditing(false);
		});
	};

	const handleCancel = () => {
		setName(user.name);
		setBio(user.bio ?? "");
		setAvatarUrl(user.avatarUrl ?? "");
		setEditing(false);
	};

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
					{editing ? (
						<div className="space-y-3">
							<div>
								<label htmlFor="profile-name" className="text-sm text-muted-foreground">
									이름
								</label>
								<Input
									id="profile-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="이름을 입력하세요"
								/>
							</div>
							<div>
								<label htmlFor="profile-avatar" className="text-sm text-muted-foreground">
									프로필 사진 URL
								</label>
								<Input
									id="profile-avatar"
									value={avatarUrl}
									onChange={(e) => setAvatarUrl(e.target.value)}
									placeholder="https://..."
								/>
							</div>
							<div>
								<label htmlFor="profile-bio" className="text-sm text-muted-foreground">
									자기소개
								</label>
								<Textarea
									id="profile-bio"
									value={bio}
									onChange={(e) => setBio(e.target.value)}
									rows={3}
									placeholder="자기소개를 입력하세요"
								/>
							</div>
							<div className="flex gap-2">
								<Button size="sm" onClick={handleSave} disabled={isPending}>
									<Save className="h-4 w-4 mr-1" />
									{isPending ? "저장 중..." : "저장"}
								</Button>
								<Button size="sm" variant="outline" onClick={handleCancel} disabled={isPending}>
									<X className="h-4 w-4 mr-1" />
									취소
								</Button>
							</div>
						</div>
					) : (
						<>
							<div className="flex items-center gap-3">
								<h1 className="text-2xl font-bold">{user.name}</h1>
								{/* <span className="text-muted-foreground">@{user.username}</span> */}
								<div className="flex items-center gap-2">
									<TierBadge tier={ratingToUserTier(user.rating ?? 0)} kind="user" size="md" />
									<span className="text-sm text-muted-foreground">Rating {user.rating ?? 0}</span>
								</div>
								{isOwner && (
									<>
										<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button size="sm" variant="ghost" asChild>
											<Link href={`/profile/${user.username}/settings`} aria-label="개인 설정">
												<Settings className="h-4 w-4" />
											</Link>
										</Button>
									</>
								)}
							</div>
							{user.bio && <p className="text-muted-foreground">{user.bio}</p>}
							<p className="text-sm text-muted-foreground">{joinDate} 가입</p>
						</>
					)}

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
