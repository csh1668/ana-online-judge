import Link from "next/link";
import { cn } from "@/lib/utils";

interface Segment {
	id: number;
	name: string;
}

interface Props {
	segments: Segment[]; // 루트 → 리프 순
	variant?: "muted" | "emphasized";
	className?: string;
}

export function SourcePath({ segments, variant = "muted", className }: Props) {
	if (segments.length === 0) return null;
	return (
		<span className={cn("inline-flex flex-wrap items-center gap-1 text-sm", className)}>
			{segments.map((seg, i) => {
				const isLast = i === segments.length - 1;
				return (
					<span key={seg.id} className="inline-flex items-center gap-1">
						<Link
							href={`/sources/${seg.id}`}
							className={cn(
								"hover:underline",
								isLast && variant === "emphasized" ? "font-semibold" : "text-muted-foreground"
							)}
						>
							{seg.name}
						</Link>
						{!isLast && <span className="text-muted-foreground">›</span>}
					</span>
				);
			})}
		</span>
	);
}
