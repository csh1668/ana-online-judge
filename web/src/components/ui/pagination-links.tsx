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

function getPageRange(currentPage: number, totalPages: number): number[] {
	const range = 5;
	let start = Math.max(1, currentPage - range);
	let end = Math.min(totalPages, currentPage + range);

	if (end - start < range * 2) {
		if (start === 1) {
			end = Math.min(totalPages, start + range * 2);
		} else if (end === totalPages) {
			start = Math.max(1, end - range * 2);
		}
	}

	const pages: number[] = [];
	for (let i = start; i <= end; i++) {
		pages.push(i);
	}
	return pages;
}

export function PaginationLinks(props: PaginationLinksProps) {
	const { currentPage, totalPages, className } = props;

	if (totalPages <= 1) return null;

	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;
	const pages = getPageRange(currentPage, totalPages);
	const wrapperClass = `flex items-center justify-center gap-1 mt-6 ${className ?? ""}`.trim();

	if ("buildHref" in props && props.buildHref) {
		const { buildHref } = props;
		return (
			<div className={wrapperClass}>
				<Button variant="outline" size="icon-sm" asChild disabled={!hasPrev}>
					<Link
						href={hasPrev ? buildHref(currentPage - 1) : "#"}
						aria-disabled={!hasPrev}
						tabIndex={hasPrev ? undefined : -1}
					>
						&lsaquo;
					</Link>
				</Button>
				{pages[0] > 1 && (
					<>
						<Button variant="outline" size="sm" asChild>
							<Link href={buildHref(1)}>1</Link>
						</Button>
						{pages[0] > 2 && <span className="px-1 text-sm text-muted-foreground">…</span>}
					</>
				)}
				{pages.map((page) => (
					<Button
						key={page}
						variant={page === currentPage ? "default" : "outline"}
						size="sm"
						asChild={page !== currentPage}
						className="min-w-8"
					>
						{page === currentPage ? (
							<span>{page}</span>
						) : (
							<Link href={buildHref(page)}>{page}</Link>
						)}
					</Button>
				))}
				{pages[pages.length - 1] < totalPages && (
					<>
						{pages[pages.length - 1] < totalPages - 1 && (
							<span className="px-1 text-sm text-muted-foreground">…</span>
						)}
						<Button variant="outline" size="sm" asChild>
							<Link href={buildHref(totalPages)}>{totalPages}</Link>
						</Button>
					</>
				)}
				<Button variant="outline" size="icon-sm" asChild disabled={!hasNext}>
					<Link
						href={hasNext ? buildHref(currentPage + 1) : "#"}
						aria-disabled={!hasNext}
						tabIndex={hasNext ? undefined : -1}
					>
						&rsaquo;
					</Link>
				</Button>
			</div>
		);
	}

	const { onPageChange, disabled } = props;
	return (
		<div className={wrapperClass}>
			<Button
				variant="outline"
				size="icon-sm"
				disabled={!hasPrev || disabled}
				onClick={() => onPageChange(currentPage - 1)}
			>
				&lsaquo;
			</Button>
			{pages[0] > 1 && (
				<>
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						onClick={() => onPageChange(1)}
						className="min-w-8"
					>
						1
					</Button>
					{pages[0] > 2 && <span className="px-1 text-sm text-muted-foreground">…</span>}
				</>
			)}
			{pages.map((page) => (
				<Button
					key={page}
					variant={page === currentPage ? "default" : "outline"}
					size="sm"
					disabled={page === currentPage || disabled}
					onClick={() => onPageChange(page)}
					className="min-w-8"
				>
					{page}
				</Button>
			))}
			{pages[pages.length - 1] < totalPages && (
				<>
					{pages[pages.length - 1] < totalPages - 1 && (
						<span className="px-1 text-sm text-muted-foreground">…</span>
					)}
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						onClick={() => onPageChange(totalPages)}
						className="min-w-8"
					>
						{totalPages}
					</Button>
				</>
			)}
			<Button
				variant="outline"
				size="icon-sm"
				disabled={!hasNext || disabled}
				onClick={() => onPageChange(currentPage + 1)}
			>
				&rsaquo;
			</Button>
		</div>
	);
}
