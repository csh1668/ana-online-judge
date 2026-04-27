"use client";

import { Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState, useTransition } from "react";
import { updateProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface InitialProfile {
	name: string;
	bio: string | null;
	avatarUrl: string | null;
}

export function ProfileForm({ initial }: { initial: InitialProfile }) {
	const { update: updateSession } = useSession();
	const [name, setName] = useState(initial.name);
	const [bio, setBio] = useState(initial.bio ?? "");
	const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? "");
	const [saved, setSaved] = useState({
		name: initial.name,
		bio: initial.bio ?? "",
		avatarUrl: initial.avatarUrl ?? "",
	});
	const [isPending, startTransition] = useTransition();
	const { toast } = useToast();

	useEffect(() => {
		setName(initial.name);
		setBio(initial.bio ?? "");
		setAvatarUrl(initial.avatarUrl ?? "");
		setSaved({
			name: initial.name,
			bio: initial.bio ?? "",
			avatarUrl: initial.avatarUrl ?? "",
		});
	}, [initial.name, initial.bio, initial.avatarUrl]);

	const dirty = name !== saved.name || bio !== saved.bio || avatarUrl !== saved.avatarUrl;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast({
				title: "저장 실패",
				description: "이름을 입력해주세요.",
				variant: "destructive",
			});
			return;
		}
		const nextBio = bio.trim() || null;
		const nextAvatarUrl = avatarUrl.trim() || null;
		startTransition(async () => {
			try {
				await updateProfile({
					name: trimmedName,
					bio: nextBio,
					avatarUrl: nextAvatarUrl,
				});
				await updateSession({ name: trimmedName, avatarUrl: nextAvatarUrl });
				setSaved({ name: trimmedName, bio: nextBio ?? "", avatarUrl: nextAvatarUrl ?? "" });
				setName(trimmedName);
				setBio(nextBio ?? "");
				setAvatarUrl(nextAvatarUrl ?? "");
				toast({ title: "저장됨", description: "프로필이 변경됐어요." });
			} catch (error) {
				console.error("updateProfile error", error);
				toast({
					title: "저장 실패",
					description: "저장 중 오류가 발생했어요.",
					variant: "destructive",
				});
			}
		});
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-1.5">
				<Label htmlFor="profile-name">이름</Label>
				<Input
					id="profile-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="이름을 입력하세요"
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="profile-avatar">프로필 사진 URL</Label>
				<Input
					id="profile-avatar"
					value={avatarUrl}
					onChange={(e) => setAvatarUrl(e.target.value)}
					placeholder="https://..."
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="profile-bio">자기소개</Label>
				<Textarea
					id="profile-bio"
					value={bio}
					onChange={(e) => setBio(e.target.value)}
					rows={3}
					placeholder="자기소개를 입력하세요"
				/>
			</div>
			<Button type="submit" disabled={isPending || !dirty}>
				<Save className="h-4 w-4 mr-1" />
				{isPending ? "저장 중..." : "저장"}
			</Button>
		</form>
	);
}
