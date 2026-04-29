"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rejudgeByFilterAction, rejudgeByIdsAction } from "@/actions/admin/submissions";
import type { AdminSubmissionFilter } from "@/lib/services/admin-submissions";
import { RejudgeBar } from "./rejudge-bar";
import { RejudgeDialog } from "./rejudge-dialog";
import { useSelection } from "./selection-context";

type Mode = "selected" | "filter" | null;

export function RejudgeShell({
	pageRowsCount,
	totalCount,
	filter,
}: {
	pageRowsCount: number;
	totalCount: number;
	filter: AdminSubmissionFilter;
}) {
	const router = useRouter();
	const sel = useSelection();
	const [dialogMode, setDialogMode] = useState<Mode>(null);

	const dialogCount =
		dialogMode === "selected" ? sel.rowIds.size : dialogMode === "filter" ? totalCount : 0;

	const onConfirm = async () => {
		if (dialogMode === "selected") {
			return rejudgeByIdsAction(Array.from(sel.rowIds));
		}
		return rejudgeByFilterAction(filter);
	};

	const close = () => {
		setDialogMode(null);
		sel.clear();
		router.refresh();
	};

	return (
		<>
			<RejudgeBar
				pageRowsCount={pageRowsCount}
				totalCount={totalCount}
				onOpenSelectedDialog={() => setDialogMode("selected")}
				onOpenFilterDialog={() => setDialogMode("filter")}
			/>
			<RejudgeDialog
				open={dialogMode !== null}
				count={dialogCount}
				onCancel={close}
				onConfirm={onConfirm}
			/>
		</>
	);
}
