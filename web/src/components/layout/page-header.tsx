import type { ReactNode } from "react";
import { CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
	title: ReactNode;
	/** 제목 아래 한 줄 설명 (text-sm muted) */
	description?: ReactNode;
	/** 제목 오른쪽 인라인 (상태 뱃지, 티어 등) */
	meta?: ReactNode;
	/** 우측 액션: 버튼, 검색창, 필터. 모바일에서는 제목 아래로 내려간다 */
	actions?: ReactNode;
	className?: string;
}

/**
 * 페이지 메인 카드의 표준 헤더. 페이지당 정확히 한 번 사용한다.
 * 제목→본문 간격은 Card의 gap-5 하나로 고정되므로 pb-* 보정을 붙이지 말 것.
 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
	return (
		<CardHeader
			className={cn(
				"flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
				className
			)}
		>
			<div className="min-w-0 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-2xl font-bold tracking-tight leading-tight">{title}</h1>
					{meta}
				</div>
				{description && <div className="text-sm text-muted-foreground">{description}</div>}
			</div>
			{actions && (
				<div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
					{actions}
				</div>
			)}
		</CardHeader>
	);
}
