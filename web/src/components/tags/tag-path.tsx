import { ChevronRight } from "lucide-react";
import type { TagPathSegment } from "@/lib/services/algorithm-tags";
import { cn } from "@/lib/utils";

interface TagPathProps {
	path: TagPathSegment[];
	className?: string;
}

export function TagPath({ path, className }: TagPathProps) {
	if (path.length === 0) return null;
	return (
		<span className={cn("inline-flex items-center text-sm flex-wrap", className)}>
			{path.map((seg, i) => (
				<span key={seg.id} className="inline-flex items-center">
					{i > 0 && <ChevronRight className="h-3 w-3 mx-0.5 text-muted-foreground shrink-0" />}
					<span className={cn(i === path.length - 1 ? "font-medium" : "text-muted-foreground")}>
						{seg.name}
					</span>
				</span>
			))}
		</span>
	);
}
