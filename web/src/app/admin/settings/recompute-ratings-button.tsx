"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
	recomputeAllProblemTiersAction,
	recomputeAllUserRatingsAction,
} from "@/actions/admin/rating";
import { Button } from "@/components/ui/button";

export function RecomputeRatingsButton() {
	const [ratingPending, startRatingTransition] = useTransition();
	const [tierPending, startTierTransition] = useTransition();

	function recomputeRatings() {
		startRatingTransition(async () => {
			try {
				const { count } = await recomputeAllUserRatingsAction();
				toast.success(`${count}명 재계산 큐 등록 완료 (백그라운드 처리)`);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "요청 실패");
			}
		});
	}

	function recomputeTiers() {
		startTierTransition(async () => {
			try {
				const { count } = await recomputeAllProblemTiersAction();
				toast.success(`${count}개 문제 티어 재계산 큐 등록 완료 (백그라운드 처리)`);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "요청 실패");
			}
		});
	}

	return (
		<div className="flex flex-wrap gap-2">
			<Button variant="outline" onClick={recomputeTiers} disabled={tierPending}>
				전체 문제 티어 재계산
			</Button>
			<Button variant="outline" onClick={recomputeRatings} disabled={ratingPending}>
				전체 사용자 레이팅 재계산
			</Button>
		</div>
	);
}
