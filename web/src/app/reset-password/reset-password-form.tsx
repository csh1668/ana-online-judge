"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";
import { changeOwnPassword } from "@/actions/users";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ResetPasswordFormProps {
	username: string;
}

export function ResetPasswordForm({ username }: ResetPasswordFormProps) {
	const router = useRouter();
	const { update } = useSession();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const formData = new FormData(event.currentTarget);
		const current = formData.get("currentPassword") as string;
		const next = formData.get("newPassword") as string;
		const confirm = formData.get("confirmPassword") as string;

		if (next.length < 8) {
			setError("새 비밀번호는 8자 이상이어야 합니다.");
			return;
		}
		if (next !== confirm) {
			setError("새 비밀번호 확인이 일치하지 않습니다.");
			return;
		}

		setIsLoading(true);
		try {
			await changeOwnPassword(current, next);
			await update({ mustChangePassword: false });
			toast.success("비밀번호가 변경되었습니다.");
			router.push("/");
			router.refresh();
		} catch (e) {
			const msg = e instanceof Error ? e.message : "비밀번호 변경 중 오류가 발생했습니다.";
			setError(msg);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold text-center">비밀번호 재설정</CardTitle>
				<CardDescription className="text-center">
					<span className="font-medium">{username}</span> 계정의 비밀번호를 변경해야 합니다.
					관리자에게 전달받은 임시 비밀번호를 입력한 뒤 새 비밀번호를 설정하세요.
				</CardDescription>
			</CardHeader>
			<form onSubmit={onSubmit}>
				<CardContent className="space-y-4">
					{error && (
						<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="currentPassword">현재(임시) 비밀번호</Label>
						<Input
							id="currentPassword"
							name="currentPassword"
							type="password"
							required
							disabled={isLoading}
							autoComplete="current-password"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="newPassword">새 비밀번호</Label>
						<Input
							id="newPassword"
							name="newPassword"
							type="password"
							required
							minLength={8}
							disabled={isLoading}
							autoComplete="new-password"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							required
							minLength={8}
							disabled={isLoading}
							autoComplete="new-password"
						/>
					</div>
				</CardContent>
				<CardFooter className="mt-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						비밀번호 변경
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
