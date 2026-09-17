"use client";

import { useActionState, useRef, useState } from "react";
import { approveDeviceAction, type DeviceFormState } from "@/app/oauth/device/actions";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/turnstile-widget";
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

interface Props {
	initialUserCode: string;
	username: string;
}

export function DeviceForm({ initialUserCode, username }: Props) {
	const [state, formAction, pending] = useActionState<DeviceFormState, FormData>(
		approveDeviceAction,
		{}
	);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const captchaRef = useRef<TurnstileWidgetHandle>(null);

	if (state.success) {
		return (
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-1">
					<CardTitle className="text-center text-2xl font-bold">앱 연결 승인</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="rounded-[2px] border border-border bg-secondary p-4 text-sm text-foreground">
						{state.success}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="space-y-1">
				<CardTitle className="text-center text-2xl font-bold">앱 연결 승인</CardTitle>
				<CardDescription className="text-center">
					<span className="font-semibold text-foreground">{username}</span> 계정으로 연결 요청을
					받았습니다.
				</CardDescription>
			</CardHeader>
			<form action={formAction}>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="user_code">확인 코드</Label>
						<Input
							id="user_code"
							name="user_code"
							defaultValue={initialUserCode}
							placeholder="XXXX-XXXX"
							required
							autoComplete="off"
							className="font-mono uppercase tracking-widest"
						/>
					</div>
					<TurnstileWidget
						ref={captchaRef}
						onVerify={(token) => setCaptchaToken(token)}
						onExpire={() => setCaptchaToken(null)}
						onError={() => setCaptchaToken(null)}
					/>
					{/* Hidden input so the server action can read cf-turnstile-response from FormData */}
					<input type="hidden" name="cf-turnstile-response" value={captchaToken ?? ""} />
					{state.error && <p className="text-sm text-destructive">{state.error}</p>}
				</CardContent>
				<CardFooter className="mt-4 flex gap-2">
					<Button
						type="submit"
						name="decision"
						value="approve"
						disabled={pending}
						className="flex-1"
					>
						{pending ? "처리 중..." : "승인"}
					</Button>
					<Button
						type="submit"
						name="decision"
						value="deny"
						variant="outline"
						disabled={pending}
						className="flex-1"
					>
						거부
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
