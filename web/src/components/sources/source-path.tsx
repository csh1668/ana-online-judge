import Link from "next/link";
import { cn } from "@/lib/utils";

interface Segment {
	id: number;
	name: string;
}

interface Props {
	segments: Segment[]; // 루트 → 리프 순
	leafLabel?: string | null; // 리프 뒤에 붙일 출처 내 문제 번호 (예: "A", "B1")
	variant?: "muted" | "emphasized";
	className?: string;
}

export function SourcePath({ segments, leafLabel, variant = "muted", className }: Props) {
	if (segments.length === 0) return null;
	const trimmedLabel = leafLabel?.trim();
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
			{trimmedLabel && (
				<span
					className={cn(
						"inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs",
						variant === "emphasized" ? "text-foreground" : "text-muted-foreground"
					)}
				>
					{trimmedLabel}
				</span>
			)}
		</span>
	);
}
