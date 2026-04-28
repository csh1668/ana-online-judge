"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGroup, searchUsersForAdmin } from "@/actions/workshop/groups";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserSearchDialog, type UserSearchResult } from "@/components/user-search-dialog";

export function CreateGroupModal() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [owner, setOwner] = useState<UserSearchResult | null>(null);

	function onSubmit() {
		if (!owner) return;
		setError(null);
		startTransition(async () => {
			try {
				await createGroup({
					name,
					description,
					initialOwnerUsername: owner.username,
				});
				setOpen(false);
				setName("");
				setDescription("");
				setOwner(null);
				router.refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "그룹 생성 실패");
			}
		});
	}

	return (
		<>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button>새 그룹 만들기</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>새 그룹 만들기</DialogTitle>
						<DialogDescription>
							그룹을 만들고 초기 owner 1명을 지정합니다. 이후 추가 멤버는 owner가 그룹 페이지에서
							추가하며, 새 멤버가 추가되면 그룹의 모든 기존 문제에 자동으로 멤버 자격이 부여됩니다.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div>
							<Label htmlFor="g-name">그룹 이름</Label>
							<Input
								id="g-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={100}
							/>
						</div>
						<div>
							<Label htmlFor="g-description">설명 (선택)</Label>
							<Textarea
								id="g-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								maxLength={1000}
								rows={3}
							/>
						</div>
						<div>
							<Label>초기 owner</Label>
							{owner ? (
								<div className="mt-1 flex items-center justify-between rounded-md border px-3 py-2">
									<div>
										<div className="font-medium text-sm">{owner.username}</div>
										<div className="text-xs text-muted-foreground">{owner.name}</div>
									</div>
									<Button type="button" variant="ghost" size="sm" onClick={() => setOwner(null)}>
										<X className="h-4 w-4" />
									</Button>
								</div>
							) : (
								<Button
									type="button"
									variant="outline"
									className="mt-1 w-full justify-start"
									onClick={() => setSearchOpen(true)}
								>
									<Search className="mr-2 h-4 w-4" /> 사용자 검색
								</Button>
							)}
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							취소
						</Button>
						<Button onClick={onSubmit} disabled={pending || !name.trim() || !owner}>
							생성
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<UserSearchDialog
				open={searchOpen}
				onOpenChange={setSearchOpen}
				title="초기 owner 선택"
				description="그룹의 초기 owner가 될 사용자를 검색하세요."
				searchAction={searchUsersForAdmin}
				onSelect={(u) => setOwner(u)}
			/>
		</>
	);
}
