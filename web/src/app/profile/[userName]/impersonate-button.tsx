"use client";

import { UserCheck } from "lucide-react";
import { useTransition } from "react";
import { startImpersonation } from "@/actions/admin";
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

export function ImpersonateButton({ userId, username }: { userId: number; username: string }) {
	const [isPending, startTransition] = useTransition();

	const handleImpersonate = () => {
		startTransition(async () => {
			await startImpersonation(userId);
			window.location.href = "/";
		});
	};

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="대리 로그인" disabled={isPending}>
					<UserCheck className="h-4 w-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>대리 로그인</AlertDialogTitle>
					<AlertDialogDescription>
						{username} 사용자로 대리 로그인합니다. 해당 사용자의 시점에서 사이트를 볼 수 있습니다.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>취소</AlertDialogCancel>
					<AlertDialogAction onClick={handleImpersonate} disabled={isPending}>
						{isPending ? "전환 중..." : "대리 로그인"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
