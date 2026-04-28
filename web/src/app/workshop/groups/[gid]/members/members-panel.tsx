"use client";

import { Loader2, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	addGroupMember,
	changeGroupMemberRole,
	removeGroupMember,
	searchUsersForGroupMember,
} from "@/actions/workshop/groups";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { UserSearchDialog, type UserSearchResult } from "@/components/user-search-dialog";

type Member = {
	userId: number;
	username: string;
	name: string;
	role: "owner" | "member";
	createdAt: Date | string;
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
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [addOpen, setAddOpen] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
	const [removeError, setRemoveError] = useState<string | null>(null);

	const ownerCount = members.filter((m) => m.role === "owner").length;

	const searchAction = useCallback(
		(query: string) => searchUsersForGroupMember(groupId, query),
		[groupId]
	);

	const handleAdd = async (user: UserSearchResult) => {
		try {
			await addGroupMember(groupId, user.username, "member");
			toast.success(`${user.username} 님을 추가했습니다`);
			setAddOpen(false);
			router.refresh();
		} catch (err) {
			throw err instanceof Error ? err : new Error("추가 실패");
		}
	};

	const handleRemove = (target: Member) => {
		setRemoveError(null);
		startTransition(async () => {
			try {
				await removeGroupMember(groupId, target.userId);
				toast.success(`${target.username} 님을 제거했습니다`);
				setRemoveTarget(null);
				router.refresh();
			} catch (err) {
				setRemoveError(err instanceof Error ? err.message : "제거 실패");
			}
		});
	};

	const handleRoleChange = (target: Member, role: "owner" | "member") => {
		if (target.role === role) return;
		startTransition(async () => {
			try {
				await changeGroupMemberRole(groupId, target.userId, role);
				toast.success(`${target.username} 님의 역할을 변경했습니다`);
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "역할 변경 실패");
			}
		});
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<div>
						<CardTitle>멤버</CardTitle>
						<p className="text-xs text-muted-foreground mt-1">
							총 {members.length}명 (소유자 {ownerCount}명)
						</p>
					</div>
					{isOwner && (
						<Button onClick={() => setAddOpen(true)} disabled={isPending}>
							<UserPlus className="h-4 w-4 mr-2" />
							멤버 추가
						</Button>
					)}
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>사용자 아이디</TableHead>
								<TableHead>이름</TableHead>
								<TableHead>역할</TableHead>
								<TableHead>가입일</TableHead>
								{isOwner && <TableHead className="text-right">작업</TableHead>}
							</TableRow>
						</TableHeader>
						<TableBody>
							{members.map((m) => {
								const isLastOwner = m.role === "owner" && ownerCount === 1;
								return (
									<TableRow key={m.userId}>
										<TableCell className="font-medium">{m.username}</TableCell>
										<TableCell>{m.name}</TableCell>
										<TableCell>
											{isOwner ? (
												<Select
													value={m.role}
													onValueChange={(v) => handleRoleChange(m, v as "owner" | "member")}
													disabled={isPending || isLastOwner}
												>
													<SelectTrigger size="sm" className="w-[120px]">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="owner">소유자</SelectItem>
														<SelectItem value="member">멤버</SelectItem>
													</SelectContent>
												</Select>
											) : (
												<Badge variant={m.role === "owner" ? "default" : "secondary"}>
													{m.role === "owner" ? "소유자" : "멤버"}
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{new Date(m.createdAt).toLocaleString("ko-KR")}
										</TableCell>
										{isOwner && (
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="icon"
													onClick={() => setRemoveTarget(m)}
													disabled={isPending || isLastOwner}
													title={isLastOwner ? "마지막 소유자는 제거할 수 없습니다" : "멤버 제거"}
												>
													<Trash2 className="h-4 w-4 text-destructive" />
												</Button>
											</TableCell>
										)}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<UserSearchDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				title="그룹 멤버 추가"
				description="아이디 또는 이름으로 검색하여 그룹 멤버로 추가합니다. 소유자 승격은 추가 후 표에서 역할을 변경하세요."
				searchAction={searchAction}
				onSelect={handleAdd}
				excludeIds={members.map((m) => m.userId)}
			/>

			<AlertDialog
				open={removeTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRemoveTarget(null);
						setRemoveError(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>멤버를 제거하시겠습니까?</AlertDialogTitle>
						<AlertDialogDescription>
							{removeTarget && (
								<>
									<span className="font-medium text-foreground">{removeTarget.username}</span> (
									{removeTarget.name}) 님을 그룹에서 제거합니다. 이 멤버가 작성한 그룹 문제의
									ownership은 다른 그룹 owner에게 자동으로 이전되며, 다른 owner가 없으면 거부됩니다.
									{removeError && <p className="text-sm text-destructive mt-2">{removeError}</p>}
								</>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								if (removeTarget) handleRemove(removeTarget);
							}}
							disabled={isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "제거"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
