import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Segment {
	id: number;
	name: string;
}

interface Props {
	segments: Segment[]; // 루트 → 현재
	className?: string;
}

export function SourceBreadcrumb({ segments, className }: Props) {
	if (segments.length === 0) return null;
	const collapse = segments.length > 4;

	return (
		<nav
			aria-label="출처 경로"
			className={cn("flex flex-wrap items-center gap-1 text-sm", className)}
		>
			<Link href="/sources" className="text-muted-foreground hover:underline">
				출처
			</Link>
			<ChevronRight className="h-4 w-4 text-muted-foreground" />
			{collapse ? (
				<>
					<Link
						href={`/sources/${segments[0].id}`}
						className="text-muted-foreground hover:underline"
					>
						{segments[0].name}
					</Link>
					<ChevronRight className="h-4 w-4 text-muted-foreground" />
					<span className="text-muted-foreground">…</span>
					<ChevronRight className="h-4 w-4 text-muted-foreground" />
					<Link
						href={`/sources/${segments[segments.length - 2].id}`}
						className="text-muted-foreground hover:underline"
					>
						{segments[segments.length - 2].name}
					</Link>
					<ChevronRight className="h-4 w-4 text-muted-foreground" />
					<span className="font-semibold">{segments[segments.length - 1].name}</span>
				</>
			) : (
				segments.map((seg, i) => {
					const isLast = i === segments.length - 1;
					return (
						<span key={seg.id} className="inline-flex items-center gap-1">
							{isLast ? (
								<span className="font-semibold">{seg.name}</span>
							) : (
								<Link href={`/sources/${seg.id}`} className="text-muted-foreground hover:underline">
									{seg.name}
								</Link>
							)}
							{!isLast && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
						</span>
					);
				})
			)}
		</nav>
	);
}
