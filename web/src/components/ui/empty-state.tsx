import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	children: ReactNode;
	action?: ReactNode;
	className?: string;
}

/** 목록/표/섹션의 빈 상태. 사이트 전체에서 이 한 가지 스타일만 쓴다. */
export function EmptyState({ children, action, className }: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 py-12 text-center text-sm text-muted-foreground",
				className
			)}
		>
			<p>{children}</p>
			{action}
		</div>
	);
}
