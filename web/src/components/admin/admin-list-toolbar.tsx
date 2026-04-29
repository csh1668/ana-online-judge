import { cn } from "@/lib/utils";

export function AdminListToolbar({
	children,
	right,
	className,
}: {
	children: React.ReactNode;
	right?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
				className
			)}
		>
			<div className="flex flex-wrap items-center gap-2">{children}</div>
			{right && <div className="flex items-center gap-2">{right}</div>}
		</div>
	);
}
