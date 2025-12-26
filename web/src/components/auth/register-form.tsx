"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
	const [isFirstUser, setIsFirstUser] = useState(false);
	const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

	useEffect(() => {
		// 회원가입 가능 여부 확인
		fetch("/api/auth/register")
			.then((res) => res.json())
			.then((data) => {
				setRegistrationOpen(data.registrationOpen);
				setIsFirstUser(data.isFirstUser);
			})
			.catch(() => setRegistrationOpen(false));
	}, []);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsLoading(true);
		setError(null);

		const formData = new FormData(event.currentTarget);
		const username = formData.get("username") as string;
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;
		const name = formData.get("name") as string;
		const email = formData.get("email") as string;

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
				body: JSON.stringify({ username, password, name, email: email || undefined }),
			});

			const data = await response.json();

			if (!response.ok) {
				if (typeof data.error === "string") {
					setError(data.error);
				} else if (data.error && typeof data.error === "object") {
					// 필드별 에러 메시지 처리
					const firstError = Object.values(data.error).flat()[0];
					setError(
						typeof firstError === "string" ? firstError : "회원가입 중 오류가 발생했습니다."
					);
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

	// 로딩 중
	if (registrationOpen === null) {
		return (
			<Card className="w-full max-w-md">
				<CardContent className="flex items-center justify-center py-12">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
				</CardContent>
			</Card>
		);
	}

	// 회원가입이 닫혀있으면
	if (!registrationOpen) {
		return (
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-1">
					<CardTitle className="text-2xl font-bold text-center">회원가입 불가</CardTitle>
					<CardDescription className="text-center">
						현재 회원가입이 비활성화되어 있습니다.
					</CardDescription>
				</CardHeader>
				<CardFooter>
					<Link href="/login" className="w-full">
						<Button variant="outline" className="w-full">
							로그인 페이지로 이동
						</Button>
					</Link>
				</CardFooter>
			</Card>
		);
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold text-center">회원가입</CardTitle>
				<CardDescription className="text-center">
					{isFirstUser
						? "첫 번째 가입자입니다. 자동으로 관리자 권한이 부여됩니다."
						: "새 계정을 만들어 시작하세요"}
				</CardDescription>
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
							minLength={3}
							maxLength={20}
							pattern="^[a-zA-Z0-9_]+$"
							autoComplete="username"
						/>
						<p className="text-xs text-muted-foreground">
							영문, 숫자, 밑줄(_)만 사용 가능 (3~20자)
						</p>
					</div>
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
							autoComplete="name"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">
							이메일 <span className="text-muted-foreground">(선택)</span>
						</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="name@example.com"
							disabled={isLoading}
							autoComplete="email"
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
							autoComplete="new-password"
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
							autoComplete="new-password"
						/>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4 mt-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{isFirstUser ? "관리자로 가입" : "회원가입"}
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
