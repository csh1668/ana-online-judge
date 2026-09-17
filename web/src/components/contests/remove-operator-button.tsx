"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeOperatorFromContest } from "@/actions/contests";
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

interface RemoveOperatorButtonProps {
	contestId: number;
	userId: number;
	username: string;
}

export function RemoveOperatorButton({ contestId, userId, username }: RemoveOperatorButtonProps) {
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	const [isRemoving, startRemoving] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const handleRemove = () => {
		startRemoving(async () => {
			setError(null);
			try {
				await removeOperatorFromContest(contestId, userId);
				setIsOpen(false);
				router.refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "운영진 제거 중 오류가 발생했습니다");
			}
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					제거
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>운영진 제거</DialogTitle>
					<DialogDescription>
						정말 &quot;{username}&quot; 사용자를 운영진에서 제거하시겠습니까?
					</DialogDescription>
				</DialogHeader>
				{error && (
					<div className="bg-destructive/10 text-destructive px-4 py-3 rounded-[2px] text-sm">
						{error}
					</div>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={() => setIsOpen(false)} disabled={isRemoving}>
						취소
					</Button>
					<Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
						{isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						제거
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
