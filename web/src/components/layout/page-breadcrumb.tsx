import Link from "next/link";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface BreadcrumbEntry {
	label: string;
	href?: string;
}

interface PageBreadcrumbProps {
	items: BreadcrumbEntry[];
	showHome?: boolean;
	className?: string;
}

export function PageBreadcrumb({ items, showHome = true, className }: PageBreadcrumbProps) {
	const entries: BreadcrumbEntry[] = showHome ? [{ label: "홈", href: "/" }, ...items] : items;

	return (
		<Breadcrumb className={cn("mb-4", className)}>
			<BreadcrumbList>
				{entries.map((entry, index) => {
					const isLast = index === entries.length - 1;
					const key = `${entry.label}-${index}`;
					return (
						<span key={key} className="inline-flex items-center gap-1.5 sm:gap-2.5">
							<BreadcrumbItem>
								{isLast || !entry.href ? (
									<BreadcrumbPage>{entry.label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link href={entry.href}>{entry.label}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
							{!isLast && <BreadcrumbSeparator />}
						</span>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
