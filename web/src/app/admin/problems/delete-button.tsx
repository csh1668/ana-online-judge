"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteProblem } from "@/actions/admin";
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

interface DeleteProblemButtonProps {
	problemId: number;
	title: string;
}

export function DeleteProblemButton({ problemId, title }: DeleteProblemButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await deleteProblem(problemId);
			setIsOpen(false);
		} catch (error) {
			console.error("Delete error:", error);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
					<Trash2 className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>문제 삭제</DialogTitle>
					<DialogDescription>
						정말 &quot;{title}&quot; 문제를 삭제하시겠습니까?
						<br />이 작업은 되돌릴 수 없으며, 관련된 모든 테스트케이스와 제출 기록도 함께
						삭제됩니다.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setIsOpen(false)} disabled={isDeleting}>
						취소
					</Button>
					<Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
						{isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						삭제
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
