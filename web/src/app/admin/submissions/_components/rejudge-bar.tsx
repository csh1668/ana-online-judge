"use client";

import { Button } from "@/components/ui/button";
import { useSelection } from "./selection-context";

export function RejudgeBar({
	pageRowsCount,
	totalCount,
	onOpenSelectedDialog,
	onOpenFilterDialog,
	onOpenSelectedDeleteDialog,
	onOpenFilterDeleteDialog,
}: {
	pageRowsCount: number;
	totalCount: number;
	onOpenSelectedDialog: () => void;
	onOpenFilterDialog: () => void;
	onOpenSelectedDeleteDialog: () => void;
	onOpenFilterDeleteDialog: () => void;
}) {
	const sel = useSelection();

	const showBanner = sel.mode === "rows" && sel.rowIds.size > 0;
	const filterMode = sel.mode === "filter";

	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div className="text-sm text-muted-foreground">
				{filterMode
					? `필터에 일치하는 전체 ${totalCount}건이 선택됨.`
					: showBanner
						? `${sel.rowIds.size}건 선택됨.`
						: `이 페이지: ${pageRowsCount}건`}
				{showBanner && (
					<>
						{" · "}
						<button
							type="button"
							className="text-primary hover:underline"
							onClick={() => sel.switchToFilterMode()}
						>
							필터에 일치하는 전체 {totalCount}건 선택
						</button>
					</>
				)}
				{filterMode && (
					<>
						{" · "}
						<button
							type="button"
							className="text-muted-foreground hover:underline"
							onClick={() => sel.clear()}
						>
							선택 해제
						</button>
					</>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Button variant="default" size="sm" disabled={!showBanner} onClick={onOpenSelectedDialog}>
					선택 항목 재채점 ({sel.rowIds.size})
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={totalCount === 0}
					onClick={onOpenFilterDialog}
				>
					필터 결과 전체 재채점 ({totalCount})
				</Button>
				<Button
					variant="destructive"
					size="sm"
					disabled={!showBanner}
					onClick={onOpenSelectedDeleteDialog}
					aria-label="선택한 제출 항목 삭제"
				>
					선택 항목 삭제 ({sel.rowIds.size})
				</Button>
				<Button
					variant="destructive"
					size="sm"
					disabled={!filterMode || totalCount === 0}
					onClick={onOpenFilterDeleteDialog}
					aria-label="필터 결과 전체 제출 삭제"
				>
					필터 결과 전체 삭제 ({totalCount})
				</Button>
			</div>
		</div>
	);
}
