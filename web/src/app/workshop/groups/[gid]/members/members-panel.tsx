"use client";

import { useState, useTransition } from "react";
import {
	addGroupMember,
	changeGroupMemberRole,
	removeGroupMember,
} from "@/actions/workshop/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type Member = {
	userId: number;
	username: string;
	name: string;
	role: "owner" | "member";
	createdAt: Date;
};

export function MembersPanel({
	groupId,
	members,
	isOwner,
}: {
	groupId: number;
	members: Member[];
	isOwner: boolean;
}) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [username, setUsername] = useState("");
	const [role, setRole] = useState<"owner" | "member">("member");

	function onAdd() {
		setError(null);
		startTransition(async () => {
			try {
				await addGroupMember(groupId, username, role);
				setUsername("");
			} catch (err) {
				setError(err instanceof Error ? err.message : "멤버 추가 실패");
			}
		});
	}

	function onRemove(targetUserId: number, displayName: string) {
		if (!confirm(`'${displayName}' 멤버를 그룹에서 제거할까요?`)) return;
		setError(null);
		startTransition(async () => {
			try {
				await removeGroupMember(groupId, targetUserId);
			} catch (err) {
				setError(err instanceof Error ? err.message : "멤버 제거 실패");
			}
		});
	}

	function onChangeRole(targetUserId: number, newRole: "owner" | "member") {
		setError(null);
		startTransition(async () => {
			try {
				await changeGroupMemberRole(groupId, targetUserId, newRole);
			} catch (err) {
				setError(err instanceof Error ? err.message : "역할 변경 실패");
			}
		});
	}

	return (
		<div className="space-y-4">
			{isOwner && (
				<div className="flex items-end gap-2 rounded-md border p-3 bg-muted/30">
					<div className="flex-1">
						<label className="text-xs text-muted-foreground" htmlFor="member-username">
							사용자명
						</label>
						<Input
							id="member-username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="username"
						/>
					</div>
					<div>
						<label className="text-xs text-muted-foreground" htmlFor="member-role">
							역할
						</label>
						<Select value={role} onValueChange={(v) => setRole(v as "owner" | "member")}>
							<SelectTrigger id="member-role" className="w-[120px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">member</SelectItem>
								<SelectItem value="owner">owner</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<Button onClick={onAdd} disabled={pending || !username.trim()}>
						멤버 추가
					</Button>
				</div>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>사용자</TableHead>
						<TableHead className="w-[120px]">역할</TableHead>
						<TableHead className="w-[180px]">가입일</TableHead>
						{isOwner && <TableHead className="w-[200px] text-right">작업</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((m) => (
						<TableRow key={m.userId}>
							<TableCell>
								<div className="font-medium">{m.name}</div>
								<div className="text-xs text-muted-foreground">@{m.username}</div>
							</TableCell>
							<TableCell className="text-sm">{m.role}</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{new Date(m.createdAt).toLocaleString("ko-KR")}
							</TableCell>
							{isOwner && (
								<TableCell className="text-right space-x-2">
									{m.role === "owner" ? (
										<Button
											variant="outline"
											size="sm"
											disabled={pending}
											onClick={() => onChangeRole(m.userId, "member")}
										>
											강등
										</Button>
									) : (
										<Button
											variant="outline"
											size="sm"
											disabled={pending}
											onClick={() => onChangeRole(m.userId, "owner")}
										>
											owner로
										</Button>
									)}
									<Button
										variant="destructive"
										size="sm"
										disabled={pending}
										onClick={() => onRemove(m.userId, m.name)}
									>
										제거
									</Button>
								</TableCell>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
