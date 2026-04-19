"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { recomputeAllUserRatingsAction } from "@/actions/admin/rating";
import { Button } from "@/components/ui/button";

export function RecomputeRatingsButton() {
	const [pending, startTransition] = useTransition();
	function onClick() {
		startTransition(async () => {
			try {
				const { count } = await recomputeAllUserRatingsAction();
				toast.success(`${count}명 재계산 큐 등록 완료 (백그라운드 처리)`);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "요청 실패");
			}
		});
	}
	return (
		<Button variant="outline" onClick={onClick} disabled={pending}>
			전체 사용자 레이팅 재계산
		</Button>
	);
}
