"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createPlaygroundSession } from "@/actions/playground";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/turnstile-widget";
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
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const captchaRef = useRef<TurnstileWidgetHandle>(null);

	function onCreate() {
		if (!captchaToken) {
			toast.error("CAPTCHA 검증을 완료해주세요");
			return;
		}
		const token = captchaToken;
		startTransition(async () => {
			try {
				await createPlaygroundSession(userId, name || "Untitled", token);
				toast.success("세션이 생성되었습니다");
				setName("");
				setCaptchaToken(null);
				captchaRef.current?.reset();
				setOpen(false);
				router.refresh();
			} catch (err) {
				captchaRef.current?.reset();
				setCaptchaToken(null);
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
				<div className="py-4 space-y-4">
					<div>
						<Label htmlFor="name" className="mb-2 block">
							세션 이름
						</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="프로젝트 이름 (선택사항)"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !pending && captchaToken) onCreate();
							}}
						/>
					</div>
					<div className="flex justify-center">
						<TurnstileWidget
							ref={captchaRef}
							onVerify={(token) => setCaptchaToken(token)}
							onExpire={() => setCaptchaToken(null)}
							onError={() => setCaptchaToken(null)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
						취소
					</Button>
					<Button onClick={onCreate} disabled={pending || !captchaToken}>
						{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "생성"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
