"use client";

import type { ReactNode } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Props = {
	label: string;
	icon?: ReactNode;
	title: string;
	description: ReactNode;
	confirmLabel: string;
	destructive?: boolean;
	disabled?: boolean;
	onConfirm: () => void;
};

/** outline 버튼 + 확인 다이얼로그. destructive면 확인 버튼을 destructive 색으로 칠한다. */
export function ConfirmButton({
	label,
	icon,
	title,
	description,
	confirmLabel,
	destructive,
	disabled,
	onConfirm,
}: Props) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="outline"
					disabled={disabled}
					className={destructive ? "text-destructive hover:text-destructive" : undefined}
				>
					{icon}
					{label}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>취소</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className={destructive ? "bg-destructive hover:bg-destructive/90" : undefined}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
