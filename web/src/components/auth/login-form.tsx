"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
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

interface LoginFormProps {
	registrationOpen?: boolean;
}

export function LoginForm({ registrationOpen = true }: LoginFormProps) {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsLoading(true);
		setError(null);

		const formData = new FormData(event.currentTarget);
		const username = formData.get("username") as string;
		const password = formData.get("password") as string;

		try {
			const result = await signIn("credentials", {
				username,
				password,
				redirect: false,
			});

			if (result?.error) {
				setError("아이디 또는 비밀번호가 올바르지 않습니다.");
			} else {
				router.push("/");
				router.refresh();
			}
		} catch {
			setError("로그인 중 오류가 발생했습니다.");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold text-center">로그인</CardTitle>
				<CardDescription className="text-center">아이디와 비밀번호를 입력하세요</CardDescription>
			</CardHeader>
			<form onSubmit={onSubmit}>
				<CardContent className="space-y-4">
					{error && (
						<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="username">아이디</Label>
						<Input
							id="username"
							name="username"
							type="text"
							placeholder="username"
							required
							disabled={isLoading}
							autoComplete="username"
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
							autoComplete="current-password"
						/>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4 mt-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						로그인
					</Button>
					{registrationOpen && (
						<p className="text-sm text-muted-foreground text-center">
							계정이 없으신가요?{" "}
							<Link href="/register" className="text-primary hover:underline">
								회원가입
							</Link>
						</p>
					)}
				</CardFooter>
			</form>
		</Card>
	);
}
