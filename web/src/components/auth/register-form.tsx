"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

export function RegisterForm() {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsLoading(true);
		setError(null);

		const formData = new FormData(event.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;
		const name = formData.get("name") as string;

		if (password !== confirmPassword) {
			setError("비밀번호가 일치하지 않습니다.");
			setIsLoading(false);
			return;
		}

		try {
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email, password, name }),
			});

			const data = await response.json();

			if (!response.ok) {
				if (typeof data.error === "string") {
					setError(data.error);
				} else {
					setError("회원가입 중 오류가 발생했습니다.");
				}
			} else {
				router.push("/login?registered=true");
			}
		} catch {
			setError("회원가입 중 오류가 발생했습니다.");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold text-center">회원가입</CardTitle>
				<CardDescription className="text-center">새 계정을 만들어 시작하세요</CardDescription>
			</CardHeader>
			<form onSubmit={onSubmit}>
				<CardContent className="space-y-4">
					{error && (
						<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="name">이름</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder="홍길동"
							required
							disabled={isLoading}
							minLength={2}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">이메일</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="name@example.com"
							required
							disabled={isLoading}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="password">비밀번호</Label>
						<Input
							id="password"
							name="password"
							type="password"
							placeholder="••••••••"
							required
							disabled={isLoading}
							minLength={8}
						/>
						<p className="text-xs text-muted-foreground">최소 8자 이상</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmPassword">비밀번호 확인</Label>
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							placeholder="••••••••"
							required
							disabled={isLoading}
							minLength={8}
						/>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						회원가입
					</Button>
					<p className="text-sm text-muted-foreground text-center">
						이미 계정이 있으신가요?{" "}
						<Link href="/login" className="text-primary hover:underline">
							로그인
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
