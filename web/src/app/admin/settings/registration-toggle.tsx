"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleRegistration } from "@/actions/settings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface RegistrationToggleProps {
	initialEnabled: boolean;
}

export function RegistrationToggle({ initialEnabled }: RegistrationToggleProps) {
	const [enabled, setEnabled] = useState(initialEnabled);
	const [isPending, startTransition] = useTransition();

	const handleToggle = (checked: boolean) => {
		startTransition(async () => {
			try {
				const result = await toggleRegistration(checked);
				setEnabled(result.enabled);
				toast.success(checked ? "회원가입이 활성화되었습니다." : "회원가입이 비활성화되었습니다.");
			} catch {
				toast.error("설정 변경에 실패했습니다.");
			}
		});
	};

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="registration-toggle" className="text-base">
					회원가입 허용
				</Label>
				<p className="text-sm text-muted-foreground">
					{enabled
						? "새로운 사용자가 회원가입할 수 있습니다."
						: "회원가입이 비활성화되어 있습니다."}
				</p>
			</div>
			<div className="flex items-center gap-2">
				{isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
				<Switch
					id="registration-toggle"
					checked={enabled}
					onCheckedChange={handleToggle}
					disabled={isPending}
				/>
			</div>
		</div>
	);
}
