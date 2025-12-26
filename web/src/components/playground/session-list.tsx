"use client";

import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Code, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPlaygroundSession, deletePlaygroundSession } from "@/actions/playground";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlaygroundSession } from "@/db/schema";

interface PlaygroundSessionListProps {
	initialSessions: PlaygroundSession[];
	userId: number;
}

export function PlaygroundSessionList({ initialSessions, userId }: PlaygroundSessionListProps) {
	const router = useRouter();
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newSessionName, setNewSessionName] = useState("");
	const [isCreating, setIsCreating] = useState(false);

	const handleCreate = async () => {
		setIsCreating(true);
		try {
			const _session = await createPlaygroundSession(userId, newSessionName || "Untitled");
			router.refresh();
			setNewSessionName("");
			setIsCreateOpen(false);
		} catch (_error) {
			alert("세션 생성 중 오류가 발생했습니다.");
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async (sessionId: string) => {
		try {
			await deletePlaygroundSession(sessionId, userId);
			router.refresh();
		} catch (_error) {
			alert("삭제 중 오류가 발생했습니다.");
		}
	};

	return (
		<div>
			<div className="flex justify-end mb-6">
				<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />새 세션 만들기
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>새 플레이그라운드 세션</DialogTitle>
						</DialogHeader>
						<div className="py-4">
							<Label htmlFor="name" className="mb-2 block">
								세션 이름
							</Label>
							<Input
								id="name"
								value={newSessionName}
								onChange={(e) => setNewSessionName(e.target.value)}
								placeholder="프로젝트 이름 (선택사항)"
								onKeyDown={(e) => e.key === "Enter" && handleCreate()}
							/>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setIsCreateOpen(false)}>
								취소
							</Button>
							<Button onClick={handleCreate} disabled={isCreating}>
								{isCreating ? "생성 중..." : "생성"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{initialSessions.length === 0 ? (
					<div className="col-span-full text-center py-20 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
						<Code className="h-10 w-10 mx-auto mb-4 opacity-50" />
						<p>생성된 세션이 없습니다. 새로운 세션을 만들어보세요!</p>
					</div>
				) : (
					initialSessions.map((session) => (
						<Card key={session.id} className="hover:border-primary/50 transition-colors">
							<CardHeader>
								<CardTitle className="truncate">{session.name}</CardTitle>
								<CardDescription>
									마지막 수정:{" "}
									{session.updatedAt
										? formatDistanceToNow(new Date(session.updatedAt), {
												addSuffix: true,
												locale: ko,
											})
										: "방금 전"}
								</CardDescription>
							</CardHeader>
							<CardContent className="h-20">{/* Preview or stats could go here */}</CardContent>
							<CardFooter className="flex justify-between mt-4">
								<Link href={`/playground/${session.id}`} passHref>
									<Button variant="outline">열기</Button>
								</Link>

								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="text-destructive hover:text-destructive hover:bg-destructive/10"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
											<AlertDialogDescription>
												이 작업은 되돌릴 수 없습니다. 세션과 모든 파일이 영구적으로 삭제됩니다.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>취소</AlertDialogCancel>
											<AlertDialogAction
												onClick={() => handleDelete(session.id)}
												className="bg-destructive hover:bg-destructive/90"
											>
												삭제
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</CardFooter>
						</Card>
					))
				)}
			</div>
		</div>
	);
}
