"use client";

import { Loader2, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	addWorkshopMember,
	changeWorkshopMemberRole,
	removeWorkshopMember,
} from "@/actions/workshop/members";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type MemberRow = {
	userId: number;
	username: string;
	name: string;
	role: "owner" | "member";
	createdAt: Date | string;
};

export function MembersClient({
	problemId,
	initialMembers,
	isOwner,
	currentUserId,
}: {
	problemId: number;
	initialMembers: MemberRow[];
	isOwner: boolean;
	currentUserId: number | null;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [addOpen, setAddOpen] = useState(false);
	const [username, setUsername] = useState("");
	const [newRole, setNewRole] = useState<"owner" | "member">("member");
	const [addError, setAddError] = useState<string | null>(null);
	const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
	const [removeError, setRemoveError] = useState<string | null>(null);

	const ownerCount = initialMembers.filter((m) => m.role === "owner").length;

	const handleAdd = () => {
		setAddError(null);
		if (!username.trim()) {
			setAddError("사용자 아이디를 입력해주세요");
			return;
		}
		startTransition(async () => {
			try {
				await addWorkshopMember(problemId, username.trim(), newRole);
				toast.success(`${username.trim()} 님을 추가했습니다`);
				setAddOpen(false);
				setUsername("");
				setNewRole("member");
				router.refresh();
			} catch (err) {
				setAddError(err instanceof Error ? err.message : "추가 실패");
			}
		});
	};

	const handleRemove = (target: MemberRow) => {
		setRemoveError(null);
		startTransition(async () => {
			try {
				await removeWorkshopMember(problemId, target.userId);
				toast.success(`${target.username} 님을 제거했습니다`);
				setRemoveTarget(null);
				router.refresh();
			} catch (err) {
				setRemoveError(err instanceof Error ? err.message : "제거 실패");
			}
		});
	};

	const handleRoleChange = (target: MemberRow, role: "owner" | "member") => {
		if (target.role === role) return;
		startTransition(async () => {
			try {
				await changeWorkshopMemberRole(problemId, target.userId, role);
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
							총 {initialMembers.length}명 (소유자 {ownerCount}명)
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
								<TableHead>추가일</TableHead>
								{isOwner && <TableHead className="text-right">작업</TableHead>}
							</TableRow>
						</TableHeader>
						<TableBody>
							{initialMembers.map((m) => {
								const isLastOwner = m.role === "owner" && ownerCount === 1;
								const isSelf = currentUserId === m.userId;
								return (
									<TableRow key={m.userId}>
										<TableCell className="font-medium">
											{m.username}
											{isSelf && <span className="ml-2 text-xs text-muted-foreground">(나)</span>}
										</TableCell>
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

			<Dialog open={addOpen} onOpenChange={setAddOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>멤버 추가</DialogTitle>
						<DialogDescription>
							창작마당 접근 권한이 있는 사용자만 추가할 수 있습니다.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div>
							<Label htmlFor="member-username">사용자 아이디</Label>
							<Input
								id="member-username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder="예: alice"
								disabled={isPending}
							/>
						</div>
						<div>
							<Label htmlFor="member-role">역할</Label>
							<Select
								value={newRole}
								onValueChange={(v) => setNewRole(v as "owner" | "member")}
								disabled={isPending}
							>
								<SelectTrigger id="member-role" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="member">멤버</SelectItem>
									<SelectItem value="owner">소유자</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{addError && <p className="text-sm text-destructive">{addError}</p>}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setAddOpen(false)} disabled={isPending}>
							취소
						</Button>
						<Button onClick={handleAdd} disabled={isPending || !username.trim()}>
							{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "추가"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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
									{removeTarget.name}) 님을 이 문제의 멤버에서 제거합니다. 이 작업은 되돌릴 수
									없습니다.
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
