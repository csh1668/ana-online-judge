"use client";

import { Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetUserPassword } from "@/actions/admin";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ResetPasswordButtonProps {
	userId: number;
	username: string;
	hasPassword: boolean;
}

export function ResetPasswordButton({ userId, username, hasPassword }: ResetPasswordButtonProps) {
	const [isPending, startTransition] = useTransition();
	const [tempPassword, setTempPassword] = useState<string | null>(null);
	const [isRevealed, setIsRevealed] = useState(false);

	const handleReset = () => {
		startTransition(async () => {
			try {
				const { tempPassword: pw } = await resetUserPassword(userId);
				setTempPassword(pw);
				setIsRevealed(false);
			} catch (error) {
				const msg = error instanceof Error ? error.message : "비밀번호 초기화에 실패했습니다.";
				toast.error(msg);
			}
		});
	};

	const handleCopy = async () => {
		if (!tempPassword) return;
		try {
			await navigator.clipboard.writeText(tempPassword);
			toast.success("클립보드에 복사되었습니다.");
		} catch {
			toast.error("복사에 실패했습니다.");
		}
	};

	const handleDialogClose = (open: boolean) => {
		if (!open) {
			setTempPassword(null);
			setIsRevealed(false);
		}
	};

	const button = (
		<Button
			variant="ghost"
			size="icon"
			disabled={isPending || !hasPassword}
			className="text-muted-foreground hover:text-foreground"
			aria-label={`${username} 비밀번호 초기화`}
		>
			<KeyRound className="h-4 w-4" />
		</Button>
	);

	return (
		<>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					{hasPassword ? (
						button
					) : (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									{/* biome-ignore lint/a11y/noNoninteractiveTabindex: wrapper span must be focusable so tooltip shows on keyboard focus for the disabled button */}
									<span tabIndex={0}>{button}</span>
								</TooltipTrigger>
								<TooltipContent>OAuth 계정은 비밀번호가 없습니다</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>비밀번호 초기화 확인</AlertDialogTitle>
						<AlertDialogDescription>
							사용자 <span className="font-semibold text-foreground">{username}</span>의 비밀번호를
							초기화합니다. 현재 비밀번호는 즉시 무효화되며, 새로 생성된 임시 비밀번호가 화면에 한
							번 표시됩니다. 사용자는 로그인 직후 새 비밀번호 설정 페이지로 이동합니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction onClick={handleReset}>초기화</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog open={tempPassword !== null} onOpenChange={handleDialogClose}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>임시 비밀번호</DialogTitle>
						<DialogDescription>
							이 창을 닫으면 다시 조회할 수 없습니다. 사용자에게 안전하게 전달하세요.
						</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-lg">
						<span className="flex-1 select-all">
							{tempPassword && (isRevealed ? tempPassword : "•".repeat(tempPassword.length))}
						</span>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setIsRevealed((v) => !v)}
							aria-label={isRevealed ? "비밀번호 숨기기" : "비밀번호 표시"}
						>
							{isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
						</Button>
						<Button variant="ghost" size="icon" onClick={handleCopy} aria-label="복사">
							<Copy className="h-4 w-4" />
						</Button>
					</div>
					<DialogFooter>
						<Button onClick={() => handleDialogClose(false)}>닫기</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
