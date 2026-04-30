"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	deleteByFilterAction,
	deleteByIdsAction,
	rejudgeByFilterAction,
	rejudgeByIdsAction,
} from "@/actions/admin/submissions";
import type { AdminSubmissionFilter } from "@/lib/services/admin-submissions";
import { DeleteDialog } from "./delete-dialog";
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
	const [deleteMode, setDeleteMode] = useState<Mode>(null);

	const dialogCount =
		dialogMode === "selected" ? sel.rowIds.size : dialogMode === "filter" ? totalCount : 0;
	const deleteCount =
		deleteMode === "selected" ? sel.rowIds.size : deleteMode === "filter" ? totalCount : 0;

	const onConfirm = async () => {
		if (dialogMode === "selected") {
			return rejudgeByIdsAction(Array.from(sel.rowIds));
		}
		return rejudgeByFilterAction(filter);
	};

	const onConfirmDelete = async () => {
		if (!deleteMode) return { deleted: 0, skipped: 0 };
		if (deleteMode === "selected") {
			return deleteByIdsAction(Array.from(sel.rowIds));
		}
		return deleteByFilterAction(filter);
	};

	const close = () => {
		setDialogMode(null);
		setDeleteMode(null);
		sel.clear();
		router.refresh();
	};

	return (
		<>
			<RejudgeBar
				pageRowsCount={pageRowsCount}
				totalCount={totalCount}
				onOpenSelectedDialog={() => {
					setDeleteMode(null);
					setDialogMode("selected");
				}}
				onOpenFilterDialog={() => {
					setDeleteMode(null);
					setDialogMode("filter");
				}}
				onOpenSelectedDeleteDialog={() => {
					setDialogMode(null);
					setDeleteMode("selected");
				}}
				onOpenFilterDeleteDialog={() => {
					setDialogMode(null);
					setDeleteMode("filter");
				}}
			/>
			<RejudgeDialog
				open={dialogMode !== null}
				count={dialogCount}
				onCancel={close}
				onConfirm={onConfirm}
			/>
			<DeleteDialog
				open={deleteMode !== null}
				count={deleteCount}
				onCancel={close}
				onConfirm={onConfirmDelete}
			/>
		</>
	);
}
