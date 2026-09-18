"use client";

import { LogOut } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTransition } from "react";
import { stopImpersonation } from "@/actions/admin";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
	const { data: session } = useSession();
	const [isPending, startTransition] = useTransition();

	const impersonator = session?.user?.impersonator;
	if (!impersonator) return null;

	return (
		<div className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-(--verdict-tle-bg) px-4 py-2 text-sm font-medium text-foreground border-b-2 border-(--verdict-tle)">
			<span>
				{impersonator.username}이(가) {session.user.username}(으)로 대리 로그인 중
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={isPending}
				onClick={() =>
					startTransition(async () => {
						await stopImpersonation();
						window.location.href = "/admin/users";
					})
				}
			>
				<LogOut className="mr-1 h-3.5 w-3.5" />
				{isPending ? "해제 중..." : "대리 로그인 해제"}
			</Button>
		</div>
	);
}
