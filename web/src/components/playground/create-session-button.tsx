"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPlaygroundSession } from "@/actions/playground";
import { Button } from "@/components/ui/button";
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

export function CreateSessionButton({
	userId,
	disabled = false,
}: {
	userId: number;
	disabled?: boolean;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [pending, startTransition] = useTransition();

	function onCreate() {
		startTransition(async () => {
			try {
				await createPlaygroundSession(userId, name || "Untitled");
				toast.success("세션이 생성되었습니다");
				setName("");
				setOpen(false);
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "세션 생성에 실패했습니다");
			}
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button disabled={disabled}>
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
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="프로젝트 이름 (선택사항)"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !pending) onCreate();
						}}
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
						취소
					</Button>
					<Button onClick={onCreate} disabled={pending}>
						{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "생성"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
