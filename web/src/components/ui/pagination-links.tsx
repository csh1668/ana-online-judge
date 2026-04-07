import Link from "next/link";
import { Button } from "@/components/ui/button";

type BaseProps = {
	currentPage: number;
	totalPages: number;
	className?: string;
};

type HrefProps = BaseProps & {
	buildHref: (page: number) => string;
	onPageChange?: never;
	disabled?: never;
};

type CallbackProps = BaseProps & {
	onPageChange: (page: number) => void;
	disabled?: boolean;
	buildHref?: never;
};

export type PaginationLinksProps = HrefProps | CallbackProps;

export function PaginationLinks(props: PaginationLinksProps) {
	const { currentPage, totalPages, className } = props;

	if (totalPages <= 1) return null;

	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;
	const wrapperClass = `flex items-center justify-center gap-2 mt-6 ${className ?? ""}`.trim();

	if ("buildHref" in props && props.buildHref) {
		const { buildHref } = props;
		return (
			<div className={wrapperClass}>
				{hasPrev && (
					<Button variant="outline" size="sm" asChild>
						<Link href={buildHref(currentPage - 1)}>이전</Link>
					</Button>
				)}
				<span className="text-sm text-muted-foreground">
					{currentPage} / {totalPages}
				</span>
				{hasNext && (
					<Button variant="outline" size="sm" asChild>
						<Link href={buildHref(currentPage + 1)}>다음</Link>
					</Button>
				)}
			</div>
		);
	}

	const { onPageChange, disabled } = props;
	return (
		<div className={wrapperClass}>
			<Button
				variant="outline"
				size="sm"
				disabled={!hasPrev || disabled}
				onClick={() => onPageChange(currentPage - 1)}
			>
				이전
			</Button>
			<span className="text-sm text-muted-foreground">
				{currentPage} / {totalPages}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={!hasNext || disabled}
				onClick={() => onPageChange(currentPage + 1)}
			>
				다음
			</Button>
		</div>
	);
}
