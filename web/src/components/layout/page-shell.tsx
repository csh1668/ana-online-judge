import type { ReactNode } from "react";
import { type BreadcrumbEntry, PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageRail, type PageRailProps } from "@/components/layout/page-rail";
import { cn } from "@/lib/utils";

export type PageShellWidth = "default" | "narrow" | "wide" | "fluid";

const WIDTH_CLASS: Record<PageShellWidth, string> = {
	default: "page-container py-8",
	narrow: "mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8",
	wide: "mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8",
	fluid: "w-full",
};

type BreadcrumbProp =
	| { breadcrumb: BreadcrumbEntry[]; breadcrumbSlot?: never }
	| { breadcrumbSlot: ReactNode; breadcrumb?: never };

type PageShellProps = BreadcrumbProp & {
	width?: PageShellWidth;
	/** breadcrumb 행 오른쪽 끝에 붙는 컨트롤 (문제 상세의 레이아웃 토글 등) */
	breadcrumbAside?: ReactNode;
	/** 좌측 sticky 레일. 내용 폭은 그대로 두고 왼쪽 바깥 여백에 붙는다(여백이 없으면 하단 버튼으로 대체). */
	rail?: PageRailProps;
	className?: string;
	children: ReactNode;
};

/**
 * 모든 페이지의 outer wrapper. breadcrumb은 필수(items 또는 slot).
 * children 사이 간격은 space-y-6 하나로 고정된다.
 */
export function PageShell({
	width = "default",
	breadcrumbAside,
	rail,
	className,
	children,
	...crumb
}: PageShellProps) {
	// breadcrumbSlot={undefined}는 홈-only breadcrumb으로 폴백한다 (슬롯을 조건부로 넘길 때 주의)
	const crumbNode =
		"breadcrumbSlot" in crumb && crumb.breadcrumbSlot !== undefined ? (
			crumb.breadcrumbSlot
		) : (
			<PageBreadcrumb items={crumb.breadcrumb ?? []} className="mb-0" />
		);

	return (
		<div className={cn(WIDTH_CLASS[width], className)}>
			<div className="mb-4 flex items-center justify-between gap-4">
				{crumbNode}
				{breadcrumbAside}
			</div>
			<div className="relative">
				{rail && <PageRail {...rail} />}
				<div className="space-y-6">{children}</div>
			</div>
		</div>
	);
}
